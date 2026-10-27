import { eq, and, desc, ne } from "drizzle-orm";
import { db, sessions } from "./index";

export async function createSession(userId: string, device: string, ip: string, userAgent: string) {
  const now = Date.now();
  const session = { id: crypto.randomUUID(), userId, device, ip, userAgent, createdAt: now, lastActiveAt: now };
  await db.insert(sessions).values(session);
  return session;
}

export async function listSessions(userId: string) {
  return db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.lastActiveAt));
}

export async function deleteSession(id: string, userId: string): Promise<boolean> {
  const result = await db.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
  return (result.rowsAffected ?? 0) > 0;
}

export async function findSession(id: string) {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function touchSession(id: string): Promise<void> {
  await db.update(sessions).set({ lastActiveAt: Date.now() }).where(eq(sessions.id, id));
}

/** Revokes every session of the user except `keepId` (e.g. after a password change) */
export async function deleteOtherSessions(userId: string, keepId: string | undefined): Promise<void> {
  await db
    .delete(sessions)
    .where(keepId ? and(eq(sessions.userId, userId), ne(sessions.id, keepId)) : eq(sessions.userId, userId));
}
