import { test, expect } from "@playwright/test";
import { register, login, DEFAULT_PASSWORD, makeEmail, registerAndSeed, seedTrace } from "./helpers";

test.describe("Settings — Sessions revoke", () => {
  test("revoking a second session removes it from the list", async ({ browser }) => {
    const email = makeEmail();

    // First context: register
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await register(page1, email);
    await ctx1.close();

    // Second context: login → creates session 2
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await login(page2, email);

    // Third context: login again → creates session 3
    const ctx3 = await browser.newContext();
    const page3 = await ctx3.newPage();
    await login(page3, email);

    try {
      // On page3 (session 3): go to Account & Security, should see 3 sessions
      await page3.goto("/settings", { waitUntil: "networkidle" });
      await page3.locator("text=Account & security").click();
      await page3.waitForLoadState("networkidle");

      const rows = page3.locator(".session-row");
      await expect(rows).toHaveCount(3, { timeout: 6_000 });

      // Revoke a non-current session (index 1 or 2 — current is index 0)
      const revokeBtn = page3.locator("button[title='Revoke']").first();
      await expect(revokeBtn).toBeVisible({ timeout: 5_000 });
      await revokeBtn.click();
      await page3.waitForTimeout(600);

      await expect(page3.locator(".session-row")).toHaveCount(2, { timeout: 5_000 });
    } finally {
      await ctx2.close();
      await ctx3.close();
    }
  });
});

test.describe("Settings — Appearance", () => {
  test("switching theme to Light applies data-theme attribute", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.locator(".set-nav-item", { hasText: "Appearance" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Light" }).click();
    await page.waitForTimeout(500);

    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    expect(theme).toBe("light");
  });

  test("changing density to Compact applies data-density attribute", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.locator(".set-nav-item", { hasText: "Appearance" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Compact" }).click();
    await page.waitForTimeout(500);

    const density = await page.evaluate(() =>
      document.documentElement.getAttribute("data-density")
    );
    expect(density).toBe("compact");
  });

  test("appearance settings persist after reload", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.locator(".set-nav-item", { hasText: "Appearance" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Light" }).click();
    await page.waitForTimeout(300);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Appearance" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button", { hasText: "Light" })).toHaveClass(/active/);
  });
});

test.describe("Settings — Export", () => {
  test("exports traces as JSONL", async ({ page }) => {
    // Set up blob interception before any navigation
    let resolveBlob!: (data: { type: string; size: number }) => void;
    const blobPromise = new Promise<{ type: string; size: number }>((r) => { resolveBlob = r; });

    await page.exposeFunction("__captureExportBlob", (type: string, size: number) => {
      resolveBlob({ type, size });
    });
    await page.addInitScript(() => {
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (src: Blob | MediaSource) {
        if (src instanceof Blob) {
          (window as any).__captureExportBlob?.(
            (src as Blob).type,
            (src as Blob).size,
          );
        }
        return orig.call(URL, src);
      };
    });

    const { token } = await registerAndSeed(page, 0);
    await seedTrace(token);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator("text=Data retention").click();
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Request export" }).click();

    const blobInfo = await Promise.race([
      blobPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("export blob timeout")), 8_000)
      ),
    ]);

    expect(blobInfo.size).toBeGreaterThan(0);
  });

  test("exports usage as CSV", async ({ page }) => {
    let resolveBlob!: (data: { type: string; size: number }) => void;
    const blobPromise = new Promise<{ type: string; size: number }>((r) => { resolveBlob = r; });

    await page.exposeFunction("__captureUsageBlob", (type: string, size: number) => {
      resolveBlob({ type, size });
    });
    await page.addInitScript(() => {
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (src: Blob | MediaSource) {
        if (src instanceof Blob) {
          (window as any).__captureUsageBlob?.(
            (src as Blob).type,
            (src as Blob).size,
          );
        }
        return orig.call(URL, src);
      };
    });

    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator("text=Data retention").click();
    await page.waitForLoadState("networkidle");

    await page.locator("button", { hasText: "Download CSV" }).click();

    const blobInfo = await Promise.race([
      blobPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("csv blob timeout")), 8_000)
      ),
    ]);

    expect(blobInfo.size).toBeGreaterThan(0);
  });
});
