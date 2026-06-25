import { test, expect } from "@playwright/test";
import { registerAndSeed, register, getToken, seedTrace } from "./helpers";

test.describe("Traces — list", () => {
  test("ingested traces appear in the list", async ({ page }) => {
    await registerAndSeed(page, 2);
    await expect(page.locator(".list-row:not(.head)")).toHaveCount(2, { timeout: 8_000 });
  });

  test("search filters visible rows", async ({ page }) => {
    const { token } = await registerAndSeed(page, 0);
    await seedTrace(token, { prompt: "unique_search_term_abc" });
    await seedTrace(token, { prompt: "another prompt" });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".list-row:not(.head)")).toHaveCount(2, { timeout: 8_000 });

    await page.locator('input[placeholder*="Search" i], input[type="search"]').fill("unique_search_term");
    await page.waitForTimeout(600);
    await expect(page.locator(".list-row:not(.head)")).toHaveCount(1, { timeout: 5_000 });
  });
});

test.describe("Traces — detail actions", () => {
  test("star and unstar a trace", async ({ page }) => {
    const { ids } = await registerAndSeed(page, 1);
    await page.goto(`/traces/${ids[0]}`);
    await page.waitForLoadState("networkidle");

    const starBtn = page.locator('button[title="Star"]');
    await expect(starBtn).toBeVisible({ timeout: 5_000 });
    await starBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('button[title="Unstar"]')).toBeVisible({ timeout: 5_000 });

    // Reload and confirm persisted
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator('button[title="Unstar"]')).toBeVisible({ timeout: 5_000 });

    // Unstar
    await page.locator('button[title="Unstar"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('button[title="Star"]')).toBeVisible({ timeout: 5_000 });
  });

  test("adds a note to a trace", async ({ page }) => {
    const { ids } = await registerAndSeed(page, 1);
    await page.goto(`/traces/${ids[0]}`);
    await page.waitForLoadState("networkidle");

    await page.locator(".insp-tab", { hasText: "Notes" }).click();
    await page.waitForTimeout(300);

    const noteText = `E2E note ${Date.now()}`;
    await page.fill("textarea", noteText);
    await page.keyboard.press("Control+Enter");
    await page.waitForTimeout(600);

    await expect(page.locator(`text=${noteText}`)).toBeVisible({ timeout: 5_000 });
  });

  test("downloads trace JSON", async ({ page }) => {
    // exposeFunction + addInitScript must be set up before any navigation
    let resolveCaptured!: (text: string) => void;
    const capturedBlobPromise = new Promise<string>((r) => { resolveCaptured = r; });

    await page.exposeFunction("__captureBlob", (text: string) => { resolveCaptured(text); });
    await page.addInitScript(() => {
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (src: Blob | MediaSource) {
        if (src instanceof Blob && (src as Blob).type === "application/json") {
          (src as Blob).text().then((text: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).__captureBlob?.(text);
          });
        }
        return orig.call(URL, src);
      };
    });

    const { ids } = await registerAndSeed(page, 1);
    await page.goto(`/traces/${ids[0]}`);
    await page.waitForLoadState("networkidle");

    // The Download button is in the Raw JSON tab
    await page.locator(".insp-tab", { hasText: "Raw JSON" }).click();
    await page.waitForTimeout(200);

    await page.locator("button", { hasText: "Download" }).click();

    const jsonText = await Promise.race([
      capturedBlobPromise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("download blob timeout")), 5_000)),
    ]);
    const json = JSON.parse(jsonText) as Record<string, unknown>;
    expect(json).toHaveProperty("id");
    expect(json).toHaveProperty("messages");
  });

  test("deletes a trace via action menu", async ({ page }) => {
    const { ids } = await registerAndSeed(page, 1);
    await page.goto(`/traces/${ids[0]}`);
    await page.waitForLoadState("networkidle");

    // Open action menu (button with title="More" wraps the ActionMenu)
    await page.locator("button[title='More']").first().click();
    await page.waitForTimeout(200);
    await page.locator(".am-item.danger", { hasText: "Delete" }).click();
    await page.waitForTimeout(600);

    // Should redirect away from the trace page
    await expect(page).not.toHaveURL(new RegExp(`/traces/${ids[0]}`), { timeout: 5_000 });
  });
});

test.describe("Traces — diff", () => {
  test("compare two traces navigates to diff view", async ({ page }) => {
    await registerAndSeed(page, 2);

    const checkboxes = page.locator(".list-row:not(.head) .cbox");
    await expect(checkboxes).toHaveCount(2, { timeout: 8_000 });
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();

    const compareBtn = page.locator("button.primary", { hasText: "Compare diff" });
    await expect(compareBtn).toBeEnabled({ timeout: 3_000 });
    await compareBtn.click();
    await page.waitForURL((url) => url.pathname.includes("/traces/diff"), { timeout: 10_000 });
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/traces/diff");
  });
});

test.describe("Traces — bulk delete", () => {
  test("selects all and bulk-deletes", async ({ page }) => {
    await registerAndSeed(page, 2);
    const checkboxes = page.locator(".list-row:not(.head) .cbox");
    await expect(checkboxes).toHaveCount(2, { timeout: 8_000 });
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();

    // Bulk delete button is icon-only with title="Delete selected"
    const deleteBtn = page.locator("button[title='Delete selected']");
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();
    await page.waitForTimeout(600);

    await expect(page.locator(".list-row:not(.head)")).toHaveCount(0, { timeout: 5_000 });
  });
});
