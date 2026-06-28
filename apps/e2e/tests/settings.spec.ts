import { test, expect } from "@playwright/test";
import { register, login, makeEmail, DEFAULT_PASSWORD } from "./helpers";

test.describe("Settings — Profile", () => {
  test("updates display name and persists after reload", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    // Profile tab is default
    const displayInput = page.locator('input[type="text"]').first();
    await displayInput.fill("Test User Name");
    await page.locator("button", { hasText: "Save changes" }).first().click();
    await expect(page.locator(".set-saved")).toBeVisible({ timeout: 5_000 });

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator('input[type="text"]').first()).toHaveValue("Test User Name");
  });

  test("shows real email in email field", async ({ page }) => {
    const email = makeEmail();
    await register(page, email);
    await page.goto("/settings", { waitUntil: "networkidle" });
    const emailField = page.locator('.field-input input[readonly].mono').first();
    await expect(emailField).toHaveValue(email);
  });
});

test.describe("Settings — Password change", () => {
  test("changes password and logs in with new password", async ({ page }) => {
    const { email } = await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.locator("text=Account & security").click();
    await page.waitForLoadState("networkidle");

    const newPassword = "NewPass123!";
    const inputs = page.locator('input[type="password"]');
    await inputs.nth(0).fill(DEFAULT_PASSWORD);
    await inputs.nth(1).fill(newPassword);
    await inputs.nth(2).fill(newPassword);
    await page.locator("button", { hasText: "Update password" }).click();
    await page.waitForTimeout(600);
    await expect(page.locator(".set-saved")).toBeVisible({ timeout: 5_000 });

    // Verify new password works
    await page.context().clearCookies();
    await login(page, email, newPassword);
    expect(page.url()).not.toContain("login");
  });
});

test.describe("Settings — Organization", () => {
  test("renames the organization", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.locator(".set-nav-item", { hasText: "Organization" }).click();
    await page.waitForLoadState("networkidle");

    const orgNameInput = page.locator('.set-row input[type="text"]').first();
    await orgNameInput.fill("My Test Org");
    await page.locator("button", { hasText: "Save changes" }).click();
    await page.waitForTimeout(600);
    await expect(page.locator(".set-saved")).toBeVisible({ timeout: 5_000 });

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Organization" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator('.set-row input[type="text"]').first()).toHaveValue("My Test Org");
  });
});

test.describe("Settings — Members", () => {
  test("new user's members list shows only themselves", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator("text=Members").first().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".member-row")).toHaveCount(1, { timeout: 5_000 });
  });

  test("sends invite and shows invite URL", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator("text=Members").first().click();
    await page.waitForLoadState("networkidle");

    const inviteeEmail = makeEmail();
    await page.locator('input[placeholder="teammate@company.com"]').fill(inviteeEmail);
    await page.locator("button", { hasText: "+ Invite" }).click();
    await page.waitForTimeout(800);

    const inviteInput = page.locator("input[readonly]");
    const inviteUrl = await inviteInput.inputValue().catch(() => null);
    expect(inviteUrl).toBeTruthy();
    expect(inviteUrl).toContain("/invite/");
  });
});

test.describe("Settings — Sessions", () => {
  test("shows at least one active session", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator("text=Account & security").click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".session-row")).toHaveCount(1, { timeout: 5_000 });
  });
});

test.describe("Settings — Data retention", () => {
  test("saves retention period", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator("text=Data retention").click();
    await page.waitForLoadState("networkidle");

    // Switch to 1 day to verify saving, then back to 7 days
    const btn1day = page.locator("button", { hasText: "1 day" });
    await btn1day.click();
    await expect(btn1day).toHaveClass(/active/, { timeout: 5_000 });
  });
});
