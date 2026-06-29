import { test, expect } from "@playwright/test";
import { register, registerAndSeed } from "./helpers";

// ── Data retention preferences ─────────────────────────────────────────────────

test.describe("Settings — PII masking toggle", () => {
  test("toggles off and persists after reload", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Data retention" }).click();
    await page.waitForLoadState("networkidle");

    // Find PII masking toggle (first toggle in data retention)
    const toggle = page.locator("button.toggle[role='switch']").nth(0);
    await expect(toggle).toHaveClass(/on/, { timeout: 5_000 }); // default true

    await toggle.click();
    await page.waitForTimeout(500);
    await expect(toggle).not.toHaveClass(/on/);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Data retention" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button.toggle[role='switch']").nth(0)).not.toHaveClass(/on/, { timeout: 5_000 });
  });

  test("re-enabling PII masking persists", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Data retention" }).click();
    await page.waitForLoadState("networkidle");

    const toggle = page.locator("button.toggle[role='switch']").nth(0);
    await toggle.click(); // off
    await page.waitForTimeout(400);
    await toggle.click(); // back on
    await page.waitForTimeout(500);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Data retention" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button.toggle[role='switch']").nth(0)).toHaveClass(/on/, { timeout: 5_000 });
  });
});

test.describe("Settings — Share anonymized data toggle", () => {
  test("toggles on and persists after reload", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Data retention" }).click();
    await page.waitForLoadState("networkidle");

    const toggle = page.locator("button.toggle[role='switch']").nth(1);
    await expect(toggle).not.toHaveClass(/on/, { timeout: 5_000 }); // default false

    await toggle.click();
    await page.waitForTimeout(500);
    await expect(toggle).toHaveClass(/on/);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Data retention" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button.toggle[role='switch']").nth(1)).toHaveClass(/on/, { timeout: 5_000 });
  });
});

// ── Appearance preferences ─────────────────────────────────────────────────────

test.describe("Settings — Appearance: Auto theme", () => {
  test("clicking Auto activates the button", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Appearance" }).click();
    await page.waitForLoadState("networkidle");

    const autoBtn = page.locator(".segmented button", { hasText: "Auto" });
    await autoBtn.click();
    await expect(autoBtn).toHaveClass(/active/, { timeout: 3_000 });

    // Persists after reload
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Appearance" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator(".segmented button", { hasText: "Auto" })).toHaveClass(/active/, { timeout: 3_000 });
  });
});

test.describe("Settings — Appearance: Mono ligatures", () => {
  test("toggling off persists after reload", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Appearance" }).click();
    await page.waitForLoadState("networkidle");

    const toggle = page.locator("button.toggle[role='switch']").nth(0);
    await expect(toggle).toHaveClass(/on/, { timeout: 5_000 }); // default true
    await toggle.click();
    await page.waitForTimeout(400);
    await expect(toggle).not.toHaveClass(/on/);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Appearance" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button.toggle[role='switch']").nth(0)).not.toHaveClass(/on/, { timeout: 5_000 });
  });
});

test.describe("Settings — Appearance: Show shortcuts", () => {
  test("toggling off persists after reload", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Appearance" }).click();
    await page.waitForLoadState("networkidle");

    const toggle = page.locator("button.toggle[role='switch']").nth(1);
    await expect(toggle).toHaveClass(/on/, { timeout: 5_000 }); // default true
    await toggle.click();
    await page.waitForTimeout(400);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Appearance" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button.toggle[role='switch']").nth(1)).not.toHaveClass(/on/, { timeout: 5_000 });
  });
});

test.describe("Settings — Appearance: Vim-style nav", () => {
  test("enabling vim nav persists after reload", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Appearance" }).click();
    await page.waitForLoadState("networkidle");

    const toggle = page.locator("button.toggle[role='switch']").nth(2);
    await expect(toggle).not.toHaveClass(/on/, { timeout: 5_000 }); // default false
    await toggle.click();
    await page.waitForTimeout(400);
    await expect(toggle).toHaveClass(/on/);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Appearance" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button.toggle[role='switch']").nth(2)).toHaveClass(/on/, { timeout: 5_000 });
  });

  test("j/k keys focus rows in trace list when vim nav enabled", async ({ page }) => {
    const { token } = await registerAndSeed(page, 3);

    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Appearance" }).click();
    await page.waitForLoadState("networkidle");

    // Enable vim nav
    await page.locator("button.toggle[role='switch']").nth(2).click();
    await page.waitForTimeout(400);

    // Go to trace list
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".list-row:not(.head)").first()).toBeVisible({ timeout: 5_000 });

    // Press j → first row gets .focused
    await page.keyboard.press("j");
    await expect(page.locator(".list-row.focused")).toHaveCount(1, { timeout: 3_000 });

    // Press j again → second row is focused
    await page.keyboard.press("j");
    const rows = page.locator(".list-row:not(.head)");
    await expect(rows.nth(1)).toHaveClass(/focused/, { timeout: 3_000 });

    // Press k → back to first row
    await page.keyboard.press("k");
    await expect(rows.nth(0)).toHaveClass(/focused/, { timeout: 3_000 });
  });

  test("Enter on focused trace navigates to detail", async ({ page }) => {
    await registerAndSeed(page, 1);

    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Appearance" }).click();
    await page.waitForLoadState("networkidle");
    await page.locator("button.toggle[role='switch']").nth(2).click();
    await page.waitForTimeout(400);

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".list-row:not(.head)").first()).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press("j");
    await expect(page.locator(".list-row.focused")).toHaveCount(1, { timeout: 3_000 });
    await page.keyboard.press("Enter");

    await page.waitForURL(/\/traces\//, { timeout: 5_000 });
  });
});

// ── Outbound webhook ───────────────────────────────────────────────────────────

test.describe("Settings — Outbound webhook", () => {
  test("saves webhook URL and shows connected badge", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Notifications" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator('input[placeholder*="webhook"]').fill("https://example.com/hook");
    await page.locator("button", { hasText: "Save" }).last().click();
    await page.waitForTimeout(600);

    await expect(page.locator(".kpill.ok").last()).toBeVisible({ timeout: 5_000 });
  });

  test("persists webhook URL after reload", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Notifications" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator('input[placeholder*="webhook"]').fill("https://example.com/hook");
    await page.locator("button", { hasText: "Save" }).last().click();
    await page.waitForTimeout(600);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Notifications" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator(".kpill.ok").last()).toBeVisible({ timeout: 5_000 });
  });

  test("disconnects webhook and hides connected badge", async ({ page }) => {
    await register(page);
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.locator(".set-nav-item", { hasText: "Notifications" }).click();
    await page.waitForLoadState("networkidle");

    await page.locator('input[placeholder*="webhook"]').fill("https://example.com/hook");
    await page.locator("button", { hasText: "Save" }).last().click();
    await page.waitForTimeout(600);

    await page.locator("button.danger", { hasText: "Disconnect" }).last().click();
    await page.waitForTimeout(500);

    await expect(page.locator(".kpill.ok").last()).not.toBeVisible({ timeout: 5_000 });
  });
});
