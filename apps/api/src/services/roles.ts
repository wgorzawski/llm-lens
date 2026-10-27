import { and, eq } from "drizzle-orm";
import { db, orgMembers, users } from "../db/index";

// Organization roles: viewer < member < admin < owner.
//   viewer - reads traces, dashboards and notes
//   member - also stars, notes, replays, sends traces and manages their own API keys
//   admin  - also deletes traces, edits org settings and manages members
//   owner  - also transfers ownership, wipes all traces and deletes the org
// Routes not listed below are open to every member (reading data, own account settings).

export type Role = "viewer" | "member" | "admin" | "owner";
const RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

const MIN_ROLE: Record<string, Role> = {
  // traces
  "POST /api/traces/openai": "member",
  "POST /api/traces/anthropic": "member",
  "POST /api/traces/vercel-ai": "member",
  "POST /api/traces/:provider": "member",
  "PATCH /api/traces/:id": "member",
  "POST /api/traces/:id/replay": "member",
  "POST /api/traces/:id/notes": "member",
  "DELETE /api/traces/:id": "admin",
  "DELETE /api/traces": "admin",
  // API keys (each person's own)
  "POST /api/keys": "member",
  "PATCH /api/keys/:id": "member",
  "DELETE /api/keys/:id": "member",
  "POST /api/keys/:id/rotate": "member",
  "POST /api/keys/webhook-secret/rotate": "admin",
  "POST /api/keys/webhook-secret/reveal": "admin",
  // organization
  "PATCH /api/orgs/me": "admin",
  "POST /api/orgs/me/logo": "admin",
  "DELETE /api/orgs/me/logo": "admin",
  "POST /api/orgs/me/members/invite": "admin",
  "PATCH /api/orgs/me/members/:id": "admin",
  "DELETE /api/orgs/me/members/:id": "admin",
  "PATCH /api/orgs/me/owner": "owner",
  "DELETE /api/orgs/me/traces": "owner",
  "DELETE /api/orgs/me": "owner",
};

/** The user's role in their current organization. No membership row = they created it = owner. */
export async function roleOf(userId: string): Promise<Role> {
  const [user] = await db.select({ org: users.org }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return "viewer";
  const [row] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgSlug, user.org), eq(orgMembers.userId, userId), eq(orgMembers.status, "active")))
    .limit(1);
  const role = row?.role as Role | undefined;
  return role && role in RANK ? role : "owner";
}

/** Error message when the user's role is too low for the route, null when allowed */
export async function checkRole(userId: string, method: string, routeUrl: string | undefined): Promise<string | null> {
  const needed = MIN_ROLE[`${method} ${(routeUrl ?? "").replace(/\/$/, "")}`];
  if (!needed) return null;
  const role = await roleOf(userId);
  return RANK[role] >= RANK[needed] ? null : `Your role (${role}) can't do this - it needs ${needed} or higher`;
}
