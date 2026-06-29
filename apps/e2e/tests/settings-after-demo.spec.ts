import { test, expect } from "@playwright/test";
import { register, makeEmail, DEFAULT_PASSWORD } from "./helpers";

// Minimal 1×1 transparent PNG for file upload tests
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("Settings — Email change", () => {
  test("changes email and shows new value in the field", async ({ page }) => {
    const { password } = await register(page);
    const newEmail = makeEmail();

    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.locator(".link-btn", { hasText: "Change" }).click();
    await page.locator('input[type="email"]').last().fill(newEmail);
    await page.locator('input[type="password"]').last().fill(password);
    await page.locator("button", { hasText: "Save new email" }).click();

    await page.waitForTimeout(600);

    const emailField = page.locator(".field-input input[readonly].mono").first();
    await expect(emailField).toHaveValue(newEmail, { timeout: 5_000 });
  });

  test("rejects wrong password during email change", async ({ page }) => {
    await register(page);
    const newEmail = makeEmail();

    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.locator(".link-btn", { hasText: "Change" }).click();
    await page.locator('input[type="email"]').last().fill(newEmail);
    await page.locator('input[type="password"]').last().fill("WrongPassword99!");
    await page.locator("button", { hasText: "Save new email" }).click();

    await expect(page.locator(".set-error")).toBeVisible({ timeout: 5_000 });
  });

  test("rejects already-taken email", async ({ page, browser }) => {
    const takenEmail = makeEmail();

    // register the email we'll try to take
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await register(page2, takenEmail);
    await ctx2.close();

    const { password } = await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.locator(".link-btn", { hasText: "Change" }).click();
    await page.locator('input[type="email"]').last().fill(takenEmail);
    await page.locator('input[type="password"]').last().fill(password);
    await page.locator("button", { hasText: "Save new email" }).click();

    await expect(page.locator(".set-error")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Settings — Avatar upload", () => {
  test("uploads avatar and shows the image", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    const fileInput = page.locator('input[type="file"][accept*="jpg"]').first();
    await fileInput.setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    await page.waitForTimeout(800);
    await expect(page.locator(".profile-avatar img")).toBeVisible({ timeout: 5_000 });
  });

  test("removes avatar and hides the image", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    const fileInput = page.locator('input[type="file"][accept*="jpg"]').first();
    await fileInput.setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await page.waitForTimeout(800);
    await expect(page.locator(".profile-avatar img")).toBeVisible({ timeout: 5_000 });

    await page.locator("button", { hasText: "Remove" }).first().click();
    await page.waitForTimeout(600);
    await expect(page.locator(".profile-avatar img")).not.toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Settings — Org logo upload", () => {
  test("uploads org logo and shows the image", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.locator(".set-nav-item", { hasText: "Organization" }).click();
    await page.waitForLoadState("networkidle");

    const fileInput = page.locator('input[type="file"][accept*="svg"]').first();
    await fileInput.setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    await page.waitForTimeout(800);
    await expect(page.locator(".org-logo img")).toBeVisible({ timeout: 5_000 });
  });

  test("removes org logo and hides the image", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.locator(".set-nav-item", { hasText: "Organization" }).click();
    await page.waitForLoadState("networkidle");

    const fileInput = page.locator('input[type="file"][accept*="svg"]').first();
    await fileInput.setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: TINY_PNG });
    await page.waitForTimeout(800);
    await expect(page.locator(".org-logo img")).toBeVisible({ timeout: 5_000 });

    await page.locator("button", { hasText: "Remove" }).first().click();
    await page.waitForTimeout(600);
    await expect(page.locator(".org-logo img")).not.toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Settings — Sign-in alerts toggle", () => {
  test("toggle saves state and persists after reload", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.locator("text=Account & security").click();
    await page.waitForLoadState("networkidle");

    const toggle = page.locator("button.toggle[role='switch']").last();

    // default is on — click to turn off
    await expect(toggle).toHaveClass(/on/, { timeout: 5_000 });
    await toggle.click();
    await page.waitForTimeout(600);
    await expect(toggle).not.toHaveClass(/on/);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator("text=Account & security").click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button.toggle[role='switch']").last()).not.toHaveClass(/on/, { timeout: 5_000 });
  });

  test("re-enabling sign-in alerts persists", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator("text=Account & security").click();
    await page.waitForLoadState("networkidle");

    const toggle = page.locator("button.toggle[role='switch']").last();
    await toggle.click(); // off
    await page.waitForTimeout(400);
    await toggle.click(); // back on
    await page.waitForTimeout(600);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator("text=Account & security").click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button.toggle[role='switch']").last()).toHaveClass(/on/, { timeout: 5_000 });
  });
});

test.describe("Settings — PagerDuty integration", () => {
  test("saves integration key and shows connected badge", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });

    await page.locator("text=Notifications").click();
    await page.waitForLoadState("networkidle");

    const keyInput = page.locator('input[placeholder*="PagerDuty"]');
    await keyInput.fill("test-pagerduty-key-abc123");
    await page.locator("button", { hasText: "Save" }).last().click();
    await page.waitForTimeout(600);

    await expect(page.locator(".kpill.ok").last()).toBeVisible({ timeout: 5_000 });
  });

  test("persists PagerDuty key after reload", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator("text=Notifications").click();
    await page.waitForLoadState("networkidle");

    await page.locator('input[placeholder*="PagerDuty"]').fill("my-pd-key-xyz");
    await page.locator("button", { hasText: "Save" }).last().click();
    await page.waitForTimeout(600);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator("text=Notifications").click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator(".kpill.ok").last()).toBeVisible({ timeout: 5_000 });
  });

  test("disconnects PagerDuty and hides connected badge", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator("text=Notifications").click();
    await page.waitForLoadState("networkidle");

    await page.locator('input[placeholder*="PagerDuty"]').fill("pd-key-to-remove");
    await page.locator("button", { hasText: "Save" }).last().click();
    await page.waitForTimeout(600);

    await page.locator("button.danger", { hasText: "Disconnect" }).last().click();
    await page.waitForTimeout(600);

    await expect(page.locator(".kpill.ok").last()).not.toBeVisible({ timeout: 5_000 });
  });
});
