import { DEMO_EMAIL } from "../constants";

// The public demo shares one login, so a single visitor could otherwise wipe the
// data, delete the org, lock everyone out (password/email change, 2FA) or change
// what every other visitor sees (org name, logo, avatar, members, API keys). These
// routes are refused for the shared demo account only - accounts visitors register
// themselves keep full functionality.

const BLOCKED_ROUTES = new Set([
  // data
  "DELETE /api/traces",
  "DELETE /api/traces/:id",
  "DELETE /api/orgs/me/traces",
  // organization
  "PATCH /api/orgs/me",
  "DELETE /api/orgs/me",
  "PATCH /api/orgs/me/owner",
  "POST /api/orgs/me/logo",
  "DELETE /api/orgs/me/logo",
  "POST /api/orgs/me/members/invite",
  "PATCH /api/orgs/me/members/:id",
  "DELETE /api/orgs/me/members/:id",
  // account
  "PATCH /api/users/me/password",
  "PATCH /api/users/me/email",
  "POST /api/users/me/avatar",
  "DELETE /api/users/me/avatar",
  "POST /api/users/me/2fa/setup",
  "POST /api/users/me/2fa/verify",
  // API keys and webhook secret
  "POST /api/keys/:id/rotate",
  "DELETE /api/keys/:id",
  "POST /api/keys/webhook-secret/rotate",
  "POST /api/keys/webhook-secret/reveal",
]);

export function isBlockedForDemoAccount(method: string, routeUrl: string | undefined, email: string | undefined): boolean {
  if (!routeUrl || email?.toLowerCase() !== DEMO_EMAIL) return false;
  return BLOCKED_ROUTES.has(`${method} ${routeUrl.replace(/\/$/, "")}`);
}
