// The public demo shares one login, so a single visitor could otherwise wipe the
// data, delete the org, or lock everyone out (password/email change, 2FA). These
// routes are refused for the shared demo account only - accounts visitors register
// themselves keep full functionality.
const DEMO_EMAIL = (process.env["DEMO_EMAIL"] ?? "demo@llmlens.dev").toLowerCase();

const BLOCKED_ROUTES = new Set([
  "DELETE /api/traces",
  "DELETE /api/traces/:id",
  "DELETE /api/orgs/me",
  "DELETE /api/orgs/me/traces",
  "PATCH /api/orgs/me/owner",
  "PATCH /api/users/me/password",
  "PATCH /api/users/me/email",
  "POST /api/users/me/2fa/setup",
  "POST /api/users/me/2fa/verify",
]);

export function isBlockedForDemoAccount(method: string, routeUrl: string | undefined, email: string | undefined): boolean {
  if (!routeUrl || email?.toLowerCase() !== DEMO_EMAIL) return false;
  return BLOCKED_ROUTES.has(`${method} ${routeUrl.replace(/\/$/, "")}`);
}
