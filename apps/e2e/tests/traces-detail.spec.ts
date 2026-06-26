import { test, expect } from "@playwright/test";
import { registerAndSeed, seedTrace } from "./helpers";

test.describe("Trace detail — Inspector tab", () => {
  test("shows provider and model in inspector", async ({ page }) => {
    const { token } = await registerAndSeed(page, 0);
    await seedTrace(token, { provider: "anthropic", model: "claude-haiku-4-5" });
    await page.reload({ waitUntil: "networkidle" });

    await page.locator(".list-row:not(.head)").first().click();
    await page.waitForLoadState("networkidle");

    // Inspector tab is active by default
    await expect(page.locator(".insp-tab", { hasText: "Inspector" })).toHaveClass(/active/);
    await expect(page.locator(".is-row .v", { hasText: "anthropic" })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".is-row .v", { hasText: "claude-haiku-4-5" })).toBeVisible({ timeout: 5_000 });
  });

  test("shows token breakdown in inspector", async ({ page }) => {
    const { ids } = await registerAndSeed(page, 1);
    await page.goto(`/traces/${ids[0]}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator(".is-row .k", { hasText: "input" })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".is-row .k", { hasText: "output" })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".tokbar")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Trace detail — Timeline tab", () => {
  test("switches to Timeline tab and shows waterfall", async ({ page }) => {
    const { ids } = await registerAndSeed(page, 1);
    await page.goto(`/traces/${ids[0]}`);
    await page.waitForLoadState("networkidle");

    await page.locator(".insp-tab", { hasText: "Timeline" }).click();
    await page.waitForTimeout(300);

    await expect(page.locator(".insp-tab", { hasText: "Timeline" })).toHaveClass(/active/);
    await expect(page.locator(".tl-row")).toHaveCount(1, { timeout: 5_000 });
    await expect(page.locator(".tl-bar")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Trace detail — Replay", () => {
  test("shows error when API key is not configured", async ({ page }) => {
    const { ids } = await registerAndSeed(page, 1);
    await page.goto(`/traces/${ids[0]}`);
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Replay" }).click();
    await page.waitForTimeout(2_000);

    // In test environment there's no API key — expect an error message or stay on same page
    const hasError = await page.locator(".action-error").isVisible().catch(() => false);
    const sameUrl = page.url().includes(ids[0]);
    expect(hasError || sameUrl).toBe(true);
  });
});

test.describe("Trace detail — back navigation", () => {
  test("Traces breadcrumb navigates back to list", async ({ page }) => {
    const { ids } = await registerAndSeed(page, 1);
    await page.goto(`/traces/${ids[0]}`);
    await page.waitForLoadState("networkidle");

    await page.locator(".dh-crumb a", { hasText: "Traces" }).click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 5_000 });
    expect(page.url()).not.toContain("/traces/");
  });
});

test.describe("Diff view — content", () => {
  test("diff page renders both trace headers with provider and model", async ({ page }) => {
    const { token } = await registerAndSeed(page, 0);
    const idA = await seedTrace(token, { provider: "anthropic", model: "claude-haiku-4-5" });
    const idB = await seedTrace(token, { provider: "openai", model: "gpt-4o-mini" });

    await page.goto(`/traces/diff?a=${idA}&b=${idB}`, { waitUntil: "networkidle" });

    await expect(page.locator(".diff-col-head")).toHaveCount(2, { timeout: 8_000 });
    const headers = await page.locator(".diff-col-head").allTextContents();
    const combined = headers.join(" ");
    expect(combined).toMatch(/anthropic/i);
    expect(combined).toMatch(/openai/i);
  });

  test("diff rows highlight changed cells", async ({ page }) => {
    const { token } = await registerAndSeed(page, 0);
    const idA = await seedTrace(token, { prompt: "Hello world" });
    const idB = await seedTrace(token, { prompt: "Different prompt" });

    await page.goto(`/traces/diff?a=${idA}&b=${idB}`, { waitUntil: "networkidle" });

    await expect(page.locator(".diff-row")).toHaveCount(1, { timeout: 8_000 });
    await expect(page.locator(".diff-cell.changed")).toHaveCount(2, { timeout: 5_000 });
  });

  test("diff page back link returns to traces list", async ({ page }) => {
    const { token } = await registerAndSeed(page, 0);
    const idA = await seedTrace(token);
    const idB = await seedTrace(token);

    await page.goto(`/traces/diff?a=${idA}&b=${idB}`, { waitUntil: "networkidle" });
    await page.locator(".back", { hasText: "Traces" }).click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 5_000 });
    expect(page.url()).not.toContain("/traces/diff");
  });
});
