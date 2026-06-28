import { test, expect } from "@playwright/test";
import { register } from "./helpers";

test.describe("API keys page (/keys)", () => {
  test("navigates to /keys when API keys is clicked in sidebar", async ({ page }) => {
    await register(page);

    await page.locator(".sb-item", { hasText: "API keys" }).click();
    await page.waitForURL("**/keys", { timeout: 8_000 });
    await page.waitForLoadState("networkidle");

    await expect(page.locator(".keys-title")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".keys-title")).toHaveText("API keys");
    expect(page.url()).toContain("/keys");
  });

  test("creates an API key and shows reveal banner", async ({ page }) => {
    await register(page);
    await page.goto("/keys", { waitUntil: "networkidle" });

    await page.locator(".keys-name-input").fill("production");
    await page.locator(".create-btn").click();
    await page.waitForTimeout(800);

    await expect(page.locator(".keys-reveal")).toBeVisible({ timeout: 5_000 });
    const keyText = await page.locator(".keys-reveal-val code").textContent();
    expect(keyText).toBeTruthy();
    expect(keyText!.length).toBeGreaterThan(10);
  });

  test("created key appears in the list", async ({ page }) => {
    await register(page);
    await page.goto("/keys", { waitUntil: "networkidle" });

    await page.locator(".keys-name-input").fill("staging");
    await page.locator(".create-btn").click();
    await page.waitForTimeout(800);

    await expect(page.locator(".key-row")).toHaveCount(1, { timeout: 5_000 });
    await expect(page.locator(".key-name")).toHaveText("staging");
  });

  test("revokes an API key", async ({ page }) => {
    await register(page);
    await page.goto("/keys", { waitUntil: "networkidle" });

    await page.locator(".keys-name-input").fill("to-revoke");
    await page.locator(".create-btn").click();
    await page.waitForTimeout(800);
    await expect(page.locator(".key-row")).toHaveCount(1, { timeout: 5_000 });

    await page.locator("button[title='Revoke']").first().click();
    await page.waitForTimeout(600);
    await expect(page.locator(".key-row")).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator(".keys-empty")).toBeVisible({ timeout: 5_000 });
  });

  test("can create multiple keys", async ({ page }) => {
    await register(page);
    await page.goto("/keys", { waitUntil: "networkidle" });

    for (const name of ["key-one", "key-two"]) {
      await page.locator(".keys-name-input").fill(name);
      await page.locator(".create-btn").click();
      await page.waitForTimeout(600);
    }

    await expect(page.locator(".key-row")).toHaveCount(2, { timeout: 5_000 });
  });

  test("key is persisted after navigating away and back", async ({ page }) => {
    await register(page);
    await page.goto("/keys", { waitUntil: "networkidle" });

    await page.locator(".keys-name-input").fill("persistent");
    await page.locator(".create-btn").click();
    await page.waitForTimeout(600);

    // Navigate to home and back
    await page.locator(".sb-item", { hasText: "Traces" }).click();
    await page.waitForURL("**/", { timeout: 5_000 });
    await page.waitForLoadState("networkidle");

    await page.locator(".sb-item", { hasText: "API keys" }).click();
    await page.waitForURL("**/keys", { timeout: 5_000 });
    await page.waitForLoadState("networkidle");

    await expect(page.locator(".key-row")).toHaveCount(1, { timeout: 5_000 });
  });
});
