import { test, expect } from "@playwright/test";
import { registerAndSeed, seedTrace, register, getToken } from "./helpers";

test.describe("Traces — view switching", () => {
  test("switches from list to table view", async ({ page }) => {
    await registerAndSeed(page, 2);

    // Click the Table segmented button
    await page.locator(".segmented button", { hasText: "Table" }).click();
    await page.waitForTimeout(300);

    // Table renders <thead> and <tbody> with real rows
    await expect(page.locator("tbody tr")).toHaveCount(2, { timeout: 6_000 });
  });

  test("switches from list to cards view", async ({ page }) => {
    await registerAndSeed(page, 2);

    await page.locator(".segmented button", { hasText: "Cards" }).click();
    await page.waitForTimeout(300);

    await expect(page.locator(".card")).toHaveCount(2, { timeout: 6_000 });
  });

  test("view selection persists after reload", async ({ page }) => {
    await registerAndSeed(page, 1);

    await page.locator(".segmented button", { hasText: "Table" }).click();
    await page.waitForTimeout(300);
    // Table view is active
    await expect(page.locator(".segmented button", { hasText: "Table" })).toHaveClass(/active/);

    await page.reload({ waitUntil: "networkidle" });
    // Cookie should restore table view
    await expect(page.locator(".segmented button", { hasText: "Table" })).toHaveClass(/active/);
  });
});

test.describe("Traces — filters", () => {
  test("provider filter hides non-matching traces", async ({ page }) => {
    // Seed one anthropic + one openai trace
    const { token } = await registerAndSeed(page, 0);
    await seedTrace(token, { provider: "anthropic", model: "claude-haiku-4-5" });
    await seedTrace(token, { provider: "openai", model: "gpt-4o-mini" });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".list-row:not(.head)")).toHaveCount(2, { timeout: 8_000 });

    // Open the provider chip (first chip-wrap, no label text)
    const providerChip = page.locator(".chip-wrap").first();
    await providerChip.locator(".chip").click();
    await page.waitForTimeout(200);

    // Select "Anthropic" from dropdown
    await page.locator(".menu-item", { hasText: "Anthropic" }).click();
    await page.waitForTimeout(600);

    await expect(page.locator(".list-row:not(.head)")).toHaveCount(1, { timeout: 8_000 });
  });

  test("status filter shows only warning traces", async ({ page }) => {
    const { token } = await registerAndSeed(page, 0);
    // warn = durationMs >= 1500; ok = fast
    await seedTrace(token, { durationMs: 2000 });
    await seedTrace(token, { durationMs: 100 });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".list-row:not(.head)")).toHaveCount(2, { timeout: 8_000 });

    // Status chip — label "Status:"
    await page.locator(".chip", { hasText: "Status" }).first().click();
    await page.waitForTimeout(200);
    await page.locator(".menu-item", { hasText: "Warning" }).click();
    await page.waitForTimeout(600);

    await expect(page.locator(".list-row:not(.head)")).toHaveCount(1, { timeout: 8_000 });
  });
});

test.describe("Traces — sort", () => {
  test("can change sort to Latency (desc)", async ({ page }) => {
    await registerAndSeed(page, 2);

    // Sort chip is on the right
    await page.locator(".chip", { hasText: "Sort" }).click();
    await page.waitForTimeout(200);
    await page.locator(".menu-item", { hasText: "Latency (desc)" }).click();
    await page.waitForTimeout(600);

    // Sort chip now shows active state (value != default)
    await expect(page.locator(".chip", { hasText: "Sort" })).toHaveClass(/active/);
  });

  test("can sort by Cost (desc)", async ({ page }) => {
    await registerAndSeed(page, 2);

    await page.locator(".chip", { hasText: "Sort" }).click();
    await page.waitForTimeout(200);
    await page.locator(".menu-item", { hasText: "Cost (desc)" }).click();
    await page.waitForTimeout(600);

    await expect(page.locator(".chip", { hasText: "Sort" })).toHaveClass(/active/);
    await expect(page.locator(".list-row:not(.head)")).toHaveCount(2, { timeout: 8_000 });
  });
});
