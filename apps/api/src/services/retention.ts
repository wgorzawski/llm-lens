import { and, eq, inArray, lt } from "drizzle-orm";
import { db, traces, users } from "../db/index.js";
import { listAllOrgs } from "../db/orgs.repository.js";

export async function enforceRetention(): Promise<void> {
  const orgs = await listAllOrgs();
  for (const org of orgs) {
    const cutoffIso = new Date(Date.now() - org.retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const orgUsers = await db.select({ id: users.id }).from(users).where(eq(users.org, org.slug));
    const userIds = orgUsers.map((u) => u.id);
    if (!userIds.length) continue;
    await db.delete(traces).where(and(inArray(traces.userId, userIds), lt(traces.timestamp, cutoffIso)));
  }
}
