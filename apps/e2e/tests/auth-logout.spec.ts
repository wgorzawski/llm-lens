import { test, expect } from "@playwright/test";
import { register } from "./helpers";

test.describe("Auth — logout", () => {
  test("logs out by clicking user footer and redirects to /login", async ({ page }) => {
    await register(page);
    await page.waitForLoadState("networkidle");

    // The sb-user footer div triggers logout() on click
    await page.locator(".sb-user").click();
    await page.waitForURL((url) => url.pathname.includes("login"), { timeout: 5_000 });
    expect(page.url()).toContain("login");
  });

  test("cannot access home after logout", async ({ page }) => {
    await register(page);
    await page.locator(".sb-user").click();
    await page.waitForURL((url) => url.pathname.includes("login"), { timeout: 5_000 });

    await page.goto("/");
    await page.waitForURL((url) => url.pathname.includes("login"), { timeout: 5_000 });
    expect(page.url()).toContain("login");
  });
});
