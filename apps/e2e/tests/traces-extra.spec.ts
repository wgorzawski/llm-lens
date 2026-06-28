import { test, expect } from "@playwright/test";
import { register, registerAndSeed, seedTrace } from "./helpers";

test.describe("Traces — empty state", () => {
  test("shows empty state when user has no traces", async ({ page }) => {
    await register(page);
    await page.waitForLoadState("networkidle");

    await expect(page.locator(".empty-state")).toBeVisible({ timeout: 6_000 });
    await expect(page.locator(".empty-title")).toHaveText("No traces yet");
  });
});

test.describe("Traces — model filter", () => {
  test("model filter shows only matching traces", async ({ page }) => {
    const { token } = await registerAndSeed(page, 0);
    await seedTrace(token, { provider: "anthropic", model: "claude-haiku-4-5" });
    await seedTrace(token, { provider: "openai", model: "gpt-4o-mini" });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".list-row:not(.head)")).toHaveCount(2, { timeout: 8_000 });

    await page.locator(".chip-wrap", { hasText: "Model" }).locator(".chip").click();
    await page.waitForTimeout(200);
    await page.locator(".menu-item", { hasText: "claude-haiku-4-5" }).click();
    await page.waitForTimeout(600);

    await expect(page.locator(".list-row:not(.head)")).toHaveCount(1, { timeout: 8_000 });
    const row = page.locator(".list-row:not(.head)").first();
    await expect(row).toContainText("claude-haiku-4-5");
  });
});

test.describe("Traces — latency filter", () => {
  test("Fast filter shows only sub-500ms traces", async ({ page }) => {
    const { token } = await registerAndSeed(page, 0);
    await seedTrace(token, { durationMs: 200 });   // fast
    await seedTrace(token, { durationMs: 3000 });  // slow (>= 1500ms)
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".list-row:not(.head)")).toHaveCount(2, { timeout: 8_000 });

    await page.locator(".chip", { hasText: "Latency" }).first().click();
    await page.waitForTimeout(200);
    await page.locator(".menu-item", { hasText: "Fast" }).click();
    await page.waitForTimeout(600);

    await expect(page.locator(".list-row:not(.head)")).toHaveCount(1, { timeout: 8_000 });
  });

  test("Slow filter shows only 1.5s–5s traces", async ({ page }) => {
    const { token } = await registerAndSeed(page, 0);
    await seedTrace(token, { durationMs: 200 });   // fast
    await seedTrace(token, { durationMs: 2000 });  // slow (1500–5000ms)
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".list-row:not(.head)")).toHaveCount(2, { timeout: 8_000 });

    await page.locator(".chip", { hasText: "Latency" }).first().click();
    await page.waitForTimeout(200);
    await page.locator(".menu-item", { hasText: "Slow" }).click();
    await page.waitForTimeout(600);

    await expect(page.locator(".list-row:not(.head)")).toHaveCount(1, { timeout: 8_000 });
  });
});

test.describe("Traces — row actions from list", () => {
  test("stars a trace via list row ActionMenu", async ({ page }) => {
    await registerAndSeed(page, 1);
    await expect(page.locator(".list-row:not(.head)")).toHaveCount(1, { timeout: 8_000 });

    const moreBtn = page.locator(".list-row:not(.head) button[title='More']");
    await moreBtn.click();
    await page.waitForTimeout(200);

    await page.locator(".am-item", { hasText: "Star" }).click();
    await page.waitForTimeout(600);

    // Reload to confirm persistence: star should now be toggleable to Unstar
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".list-row:not(.head) button[title='More']").click();
    await page.waitForTimeout(200);
    await expect(page.locator(".am-item", { hasText: "Unstar" })).toBeVisible({ timeout: 5_000 });
  });

  test("deletes a trace via list row ActionMenu", async ({ page }) => {
    await registerAndSeed(page, 2);
    await expect(page.locator(".list-row:not(.head)")).toHaveCount(2, { timeout: 8_000 });

    const moreBtn = page.locator(".list-row:not(.head) button[title='More']").first();
    await moreBtn.click();
    await page.waitForTimeout(200);
    await page.locator(".am-item.danger", { hasText: "Delete" }).click();
    await page.waitForTimeout(600);

    await expect(page.locator(".list-row:not(.head)")).toHaveCount(1, { timeout: 5_000 });
  });
});

test.describe("Traces — bulk export", () => {
  test("exports selected traces as JSON", async ({ page }) => {
    let resolveBlob!: (data: { size: number }) => void;
    const blobPromise = new Promise<{ size: number }>((r) => { resolveBlob = r; });

    await page.exposeFunction("__captureBulkExport", (size: number) => {
      resolveBlob({ size });
    });
    await page.addInitScript(() => {
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (src: Blob | MediaSource) {
        if (src instanceof Blob && (src as Blob).type === "application/json") {
          (window as any).__captureBulkExport?.((src as Blob).size);
        }
        return orig.call(URL, src);
      };
    });

    await registerAndSeed(page, 2);
    const checkboxes = page.locator(".list-row:not(.head) .cbox");
    await expect(checkboxes).toHaveCount(2, { timeout: 8_000 });
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();

    await page.locator(".bulkbar button", { hasText: "Export" }).click();

    const blobInfo = await Promise.race([
      blobPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("export blob timeout")), 5_000),
      ),
    ]);
    expect(blobInfo.size).toBeGreaterThan(0);
  });
});
