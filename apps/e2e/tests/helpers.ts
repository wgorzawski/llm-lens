import type { Page } from "@playwright/test";

export const API_BASE = process.env.E2E_API_URL
  ? `${process.env.E2E_API_URL}/api`
  : "http://localhost:3001/api";

export function makeEmail() {
  return `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
}

export const DEFAULT_PASSWORD = "Sup3rSecret!";

export async function register(page: Page, email = makeEmail(), password = DEFAULT_PASSWORD) {
  await page.goto("/register", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("register"), { timeout: 10_000 });
  return { email, password };
}

export async function login(page: Page, email: string, password = DEFAULT_PASSWORD) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 10_000 });
}

export async function getToken(page: Page): Promise<string> {
  return page.evaluate(
    () => document.cookie.match(/auth_token=([^;]+)/)?.[1] ?? "",
  );
}

export async function seedTrace(
  token: string,
  opts: { model?: string; prompt?: string; provider?: "anthropic" | "openai"; durationMs?: number; status?: "ok" | "warn" | "error" } = {},
) {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const provider = opts.provider ?? "anthropic";
  // status "warn" requires durationMs >= 1500, "ok" < 1500
  const durationMs = opts.durationMs ?? (opts.status === "warn" ? 2000 : opts.status === "error" ? 342 : 342);

  let payload: Record<string, unknown>;
  let endpoint: string;

  if (provider === "openai") {
    const model = opts.model ?? "gpt-4o-mini";
    const openaiId = `chatcmpl_e2e_${uid}`;
    payload = {
      request: {
        model,
        messages: [{ role: "user", content: opts.prompt ?? "Say hello." }],
        max_tokens: 100,
      },
      response: {
        id: openaiId,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          message: { role: "assistant", content: "Hello! How can I help?" },
          finish_reason: "stop",
        }],
        usage: { prompt_tokens: 7, completion_tokens: 10, total_tokens: 17 },
      },
      timestamp: new Date().toISOString(),
      durationMs,
    };
    endpoint = `${API_BASE}/traces/openai`;
  } else {
    const model = opts.model ?? "claude-3-5-sonnet-20241022";
    const anthropicId = `msg_e2e_${uid}`;
    payload = {
      request: {
        model,
        messages: [{ role: "user", content: opts.prompt ?? "Say hello." }],
        max_tokens: 100,
      },
      response: {
        id: anthropicId,
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Hello! How can I help you today?" }],
        model,
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 7, output_tokens: 10 },
      },
      timestamp: new Date().toISOString(),
      durationMs,
    };
    endpoint = `${API_BASE}/traces/anthropic`;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`seedTrace failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { id: string };
  return data.id;
}

export async function registerAndSeed(page: Page, count = 2) {
  const { email, password } = await register(page);
  const token = await getToken(page);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(await seedTrace(token, { prompt: `Test prompt ${i + 1}` }));
  }
  await page.reload({ waitUntil: "networkidle" });
  return { email, password, token, ids };
}
