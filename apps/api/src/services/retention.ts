import { and, eq, inArray, lt } from "drizzle-orm";
import { db, traces, users, client } from "../db/index";
import { listAllOrgs } from "../db/orgs.repository";

// minRetentionDays puts a floor under each org's own setting - the demo uses it so
// a visitor lowering retention on the shared demo account can't wipe the data.
// retentionDays = 0 means "keep forever".
export async function enforceRetention(minRetentionDays = 0): Promise<void> {
  const orgs = await listAllOrgs();
  for (const org of orgs) {
    if (org.retentionDays <= 0) continue;
    const retentionDays = Math.max(org.retentionDays, minRetentionDays);
    const cutoffIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const orgUsers = await db.select({ id: users.id }).from(users).where(eq(users.org, org.slug));
    const userIds = orgUsers.map((u) => u.id);
    if (!userIds.length) continue;
    const result = await db.delete(traces).where(and(inArray(traces.userId, userIds), lt(traces.timestamp, cutoffIso)));
    if ((result.rowsAffected ?? 0) > 0) {
      await client.execute(`DELETE FROM traces_fts WHERE id NOT IN (SELECT id FROM traces)`);
    }
  }
}
