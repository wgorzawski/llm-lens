import { eq } from "drizzle-orm";
import { db, users } from "./index";

// Whose traces a user can see: everyone in their organization. Members who accepted an
// invite share the inviter's org slug; "personal" (legacy default, also given to people
// removed from an org) is never shared - it means "just me".

const CACHE_MS = 5_000;
const cache = new Map<string, { ids: string[]; at: number }>();

export async function visibleUserIds(userId: string): Promise<string[]> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ids;

  const [user] = await db.select({ org: users.org }).from(users).where(eq(users.id, userId)).limit(1);
  let ids = [userId];
  if (user && user.org && user.org !== "personal") {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.org, user.org));
    ids = rows.map((r) => r.id);
    if (!ids.includes(userId)) ids.push(userId);
  }
  cache.set(userId, { ids, at: Date.now() });
  if (cache.size > 1000) cache.clear();
  return ids;
}

/** Forget cached scopes after membership changes (invite accepted, member removed...) */
export function clearScopeCache(): void {
  cache.clear();
}

/** `user_id IN (?, ?, ...)` for raw SQL, with its arguments */
export function userIdIn(ids: string[], column = "user_id"): { sql: string; args: string[] } {
  return { sql: `${column} IN (${ids.map(() => "?").join(", ")})`, args: ids };
}
