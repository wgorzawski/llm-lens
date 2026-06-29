import { test, expect, type Page } from "@playwright/test";
import { register, getToken, seedTrace } from "./helpers";

async function goToDangerZone(page: Page) {
  await page.goto("/settings", { waitUntil: "networkidle" });
  await page.locator(".set-nav-item", { hasText: "Danger zone" }).click();
  await page.waitForLoadState("networkidle");
}

async function getOrgSlug(page: Page): Promise<string> {
  await page.locator("button", { hasText: "Wipe traces…" }).click();
  const slug = await page.locator("input.mono[placeholder]").first().getAttribute("placeholder");
  await page.locator("button", { hasText: "Cancel" }).first().click();
  return slug ?? "";
}

test.describe("Settings — Danger zone: Transfer ownership", () => {
  test("expand/collapse transfer form", async ({ page }) => {
    await register(page);
    await goToDangerZone(page);

    const btn = page.locator("button", { hasText: "Transfer…" });
    await btn.click();
    await expect(page.locator("input[type='email']").last()).toBeVisible();

    await page.locator("button", { hasText: "Cancel" }).first().click();
    await expect(page.locator("input[type='email']").last()).not.toBeVisible();
  });

  test("confirm button disabled when email is empty", async ({ page }) => {
    await register(page);
    await goToDangerZone(page);

    await page.locator("button", { hasText: "Transfer…" }).click();
    const confirm = page.locator("button", { hasText: "Confirm transfer" });
    await expect(confirm).toBeDisabled();
  });

  test("shows error for non-member email", async ({ page }) => {
    await register(page);
    await goToDangerZone(page);

    await page.locator("button", { hasText: "Transfer…" }).click();
    await page.locator("input[type='email']").last().fill("nobody@example.com");
    await page.locator("button", { hasText: "Confirm transfer" }).click();

    await expect(page.locator(".set-error").last()).toBeVisible({ timeout: 5_000 });
  });

  test("shows error when trying to transfer to yourself", async ({ page }) => {
    const { email } = await register(page);
    await goToDangerZone(page);

    await page.locator("button", { hasText: "Transfer…" }).click();
    await page.locator("input[type='email']").last().fill(email);
    await page.locator("button", { hasText: "Confirm transfer" }).click();

    await expect(page.locator(".set-error").last()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Settings — Danger zone: Wipe all traces", () => {
  test("confirm button disabled when slug doesn't match", async ({ page }) => {
    await register(page);
    await goToDangerZone(page);

    await page.locator("button", { hasText: "Wipe traces…" }).click();
    await page.locator("input.mono").first().fill("wrong-slug");
    await expect(page.locator("button", { hasText: "Delete all traces" })).toBeDisabled();
  });

  test("wipes all traces when slug confirmed", async ({ page }) => {
    await register(page);
    const token = await getToken(page);
    await seedTrace(token);
    await seedTrace(token);

    await goToDangerZone(page);

    const slug = await getOrgSlug(page);
    expect(slug.length).toBeGreaterThan(0);

    await page.locator("button", { hasText: "Wipe traces…" }).click();
    await page.locator("input.mono").first().fill(slug);
    await page.locator("button", { hasText: "Delete all traces" }).click();

    await expect(page.locator(".set-saved").last()).toBeVisible({ timeout: 6_000 });

    // Navigate to trace list and confirm it's empty
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".list-row:not(.head)")).toHaveCount(0, { timeout: 5_000 });
  });

  test("collapses wipe form on cancel", async ({ page }) => {
    await register(page);
    await goToDangerZone(page);

    await page.locator("button", { hasText: "Wipe traces…" }).click();
    await expect(page.locator(".danger-form")).toBeVisible();

    await page.locator("button", { hasText: "Cancel" }).first().click();
    await expect(page.locator(".danger-form")).not.toBeVisible();
  });
});

test.describe("Settings — Danger zone: Delete organization", () => {
  test("confirm button disabled when slug doesn't match", async ({ page }) => {
    await register(page);
    await goToDangerZone(page);

    await page.locator("button", { hasText: "Delete organization…" }).click();
    await page.locator("input.mono").last().fill("wrong-slug");
    await expect(page.locator("button", { hasText: "Delete organization permanently" })).toBeDisabled();
  });

  test("deletes organization and redirects to home", async ({ page }) => {
    await register(page);
    await goToDangerZone(page);

    // Get slug from wipe form
    const slug = await getOrgSlug(page);
    expect(slug.length).toBeGreaterThan(0);

    await page.locator("button", { hasText: "Delete organization…" }).click();
    await page.locator("input.mono").last().fill(slug);
    await page.locator("button", { hasText: "Delete organization permanently" }).click();

    // Should redirect to home after deletion
    await page.waitForURL("/", { timeout: 10_000 });
  });
});
