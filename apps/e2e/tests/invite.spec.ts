import { test, expect } from "@playwright/test";
import { register, makeEmail, DEFAULT_PASSWORD } from "./helpers";

test.describe("Invite flow", () => {
  test("invited user can accept invite and appears in members list", async ({ browser }) => {
    // Two separate browser contexts — owner and invitee
    const ownerCtx = await browser.newContext();
    const inviteeCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const inviteePage = await inviteeCtx.newPage();

    try {
      // Owner registers and sends invite
      await register(ownerPage);
      await ownerPage.goto("/settings", { waitUntil: "networkidle" });
      await ownerPage.locator("text=Members").first().click();
      await ownerPage.waitForLoadState("networkidle");

      const inviteeEmail = makeEmail();
      await ownerPage.locator('input[placeholder="teammate@company.com"]').fill(inviteeEmail);
      await ownerPage.locator("button", { hasText: "+ Invite" }).click();
      await ownerPage.waitForTimeout(800);

      const inviteUrl = await ownerPage.locator("input[readonly]").inputValue();
      expect(inviteUrl).toContain("/invite/");

      // Invitee registers and visits invite link
      await register(inviteePage, inviteeEmail);
      await inviteePage.goto(inviteUrl, { waitUntil: "networkidle" });

      // Accept the invite if button is present
      const acceptBtn = inviteePage.locator("button", { hasText: /accept/i });
      if (await acceptBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await acceptBtn.click();
        await inviteePage.waitForTimeout(600);
      }

      // Owner reloads and sees invitee in members list
      await ownerPage.reload({ waitUntil: "networkidle" });
      await ownerPage.locator("text=Members").first().click();
      await ownerPage.waitForLoadState("networkidle");
      const memberEmails = await ownerPage.locator(".member-row .member-email, .member-row").allTextContents();
      const found = memberEmails.some((t) => t.includes(inviteeEmail.split("@")[0]!));
      expect(found, `Expected ${inviteeEmail} in member rows: ${JSON.stringify(memberEmails)}`).toBe(true);
    } finally {
      await ownerCtx.close();
      await inviteeCtx.close();
    }
  });

  test("invite token page shows 404 for unknown token", async ({ page }) => {
    await page.goto("/invite/invalid-token-xyz");
    await page.waitForLoadState("networkidle");
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toMatch(/not found|invalid|expired|error/i);
  });
});
