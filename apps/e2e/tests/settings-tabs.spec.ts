import { test, expect } from "@playwright/test";
import { register } from "./helpers";

test.describe("Settings — Notifications tab", () => {
  test("navigates to Notifications and shows toggles", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.locator(".set-nav-item", { hasText: "Notifications" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button.toggle")).toHaveCount(5, { timeout: 5_000 });
  });

  test("toggling a notification preference persists after reload", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Notifications" }).click();
    await page.waitForLoadState("networkidle");

    // Weekly recap is off by default — toggle it on
    const weeklyToggle = page.locator("button.toggle").nth(1);
    const wasOn = await weeklyToggle.evaluate((el) => el.classList.contains("on"));
    await weeklyToggle.click();
    await page.waitForTimeout(600);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Notifications" }).click();
    await page.waitForLoadState("networkidle");

    const weeklyAfter = page.locator("button.toggle").nth(1);
    const isOnAfter = await weeklyAfter.evaluate((el) => el.classList.contains("on"));
    expect(isOnAfter).toBe(!wasOn);
  });
});

test.describe("Settings — Danger zone tab", () => {
  test("navigates to Danger zone and shows destructive actions", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.locator(".set-nav-item", { hasText: "Danger zone" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator(".danger-title", { hasText: "Wipe all traces" })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".danger-title", { hasText: "Delete organization" })).toBeVisible({ timeout: 5_000 });
  });
});

