import { describe, it, expect, beforeEach } from "vitest";
import OpenAI from "openai";
import { instrumentOpenAI } from "./openai.js";
import { maskPII } from "./core.js";

type Sent = { url: string; body: Record<string, any> };

const completion = {
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 1761600000,
  model: "openai/gpt-oss-120b",
  choices: [{ index: 0, message: { role: "assistant", content: "Hi" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
};

let sent: Sent[] = [];
let llmLensDown = false;

// One fake fetch serves both sides: the "Groq" API the SDK calls and the llm-lens API.
function fakeFetch(groq: () => Response) {
  return async (input: any, init?: any): Promise<Response> => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("http://lens.test")) {
      if (llmLensDown) throw new Error("ECONNREFUSED");
      sent.push({ url, body: JSON.parse(init.body) });
      return new Response("{}", { status: 201 });
    }
    return groq();
  };
}

function makeClient(groq: () => Response, extra: Record<string, unknown> = {}) {
  const f = fakeFetch(groq);
  const origFetch = globalThis.fetch;
  // instrument uses the global fetch for delivery
  globalThis.fetch = f as typeof fetch;
  const client = new OpenAI({ apiKey: "x", baseURL: "http://groq.test/v1", fetch: f as any, maxRetries: 0 });
  instrumentOpenAI(client, { apiUrl: "http://lens.test", apiKey: "k", provider: "groq", ...extra });
  return { client, restore: () => (globalThis.fetch = origFetch) };
}

const ok = () => new Response(JSON.stringify(completion), { status: 200, headers: { "content-type": "application/json", "x-ratelimit-remaining-tokens": "7000" } });
const flush = () => new Promise((r) => setTimeout(r, 20));

describe("instrumentOpenAI", () => {
  beforeEach(() => {
    sent = [];
    llmLensDown = false;
  });

  it("returns the response and sends a trace to the provider route", async () => {
    const { client, restore } = makeClient(ok, { metadata: { env: "production" }, context: () => ({ name: "faq" }) });
    const res = await client.chat.completions.create({ model: "openai/gpt-oss-120b", messages: [{ role: "user", content: "hi" }] });
    await flush();
    restore();
    expect(res.choices[0]!.message.content).toBe("Hi");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("http://lens.test/api/traces/groq");
    expect(sent[0]!.body.response.id).toBe("chatcmpl-1");
    expect(sent[0]!.body.metadata).toEqual({ env: "production", name: "faq" });
    expect(typeof sent[0]!.body.durationMs).toBe("number");
  });

  it("keeps .withResponse() working", async () => {
    const { client, restore } = makeClient(ok);
    const { data, response } = await client.chat.completions
      .create({ model: "m", max_tokens: 1, messages: [{ role: "user", content: "ping" }] })
      .withResponse();
    await flush();
    restore();
    expect(data.id).toBe("chatcmpl-1");
    expect(response.headers.get("x-ratelimit-remaining-tokens")).toBe("7000");
  });

  it("sends failed calls as error traces and still rejects", async () => {
    const { client, restore } = makeClient(
      () => new Response(JSON.stringify({ error: { message: "Rate limit reached", code: "rate_limit_exceeded", type: "tokens" } }), { status: 429, headers: { "content-type": "application/json" } })
    );
    const err = await client.chat.completions.create({ model: "m", messages: [{ role: "user", content: "hi" }] }).catch((e) => e);
    await flush();
    restore();
    expect(err.status).toBe(429);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body.error).toMatchObject({ status: 429, code: "rate_limit_exceeded" });
    expect(sent[0]!.body.response).toBeUndefined();
  });

  it("never affects the app when llm-lens is down", async () => {
    llmLensDown = true;
    const errors: unknown[] = [];
    const { client, restore } = makeClient(ok, { onError: (e: unknown) => errors.push(e) });
    const res = await client.chat.completions.create({ model: "m", messages: [{ role: "user", content: "hi" }] });
    await flush();
    restore();
    expect(res.id).toBe("chatcmpl-1");
    expect(errors).toHaveLength(1);
  });

  it("skips calls when told to, and when disabled", async () => {
    const a = makeClient(ok, { skip: (p: any) => p.max_tokens === 1 });
    await a.client.chat.completions.create({ model: "m", max_tokens: 1, messages: [{ role: "user", content: "ping" }] });
    await flush();
    a.restore();
    const b = makeClient(ok, { enabled: false });
    await b.client.chat.completions.create({ model: "m", messages: [{ role: "user", content: "hi" }] });
    await flush();
    b.restore();
    expect(sent).toHaveLength(0);
  });

  it("masks PII before sending when asked", async () => {
    const { client, restore } = makeClient(ok, { maskPII: true });
    await client.chat.completions.create({ model: "m", messages: [{ role: "user", content: "mail me: a.b@example.com, tel 600 700 800" }] });
    await flush();
    restore();
    expect(sent[0]!.body.request.messages[0].content).toBe("mail me: [email], tel [phone]");
  });

  it("maskPII leaves ordinary text alone", () => {
    expect(maskPII("2 jajka, 200 g mąki, 2026-10-27")).toBe("2 jajka, 200 g mąki, 2026-10-27");
  });
});
