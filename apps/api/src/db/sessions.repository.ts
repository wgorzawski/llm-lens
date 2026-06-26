import { eq, and, desc } from "drizzle-orm";
import { db, sessions } from "./index.js";

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
