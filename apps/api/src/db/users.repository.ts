import { eq, or } from "drizzle-orm";
import { db, users } from "./index.js";

export async function createUser(email: string, passwordHash: string, provider = "email", providerId?: string) {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, email, passwordHash, provider, providerId: providerId ?? null });
  return { id, email };
}

export async function findUserByEmail(email: string) {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function findOrCreateOAuthUser(email: string, provider: string, providerId: string) {
  const existing = await findUserByEmail(email);
  if (existing) return { id: existing.id, email: existing.email };
  return createUser(email, "", provider, providerId);
}
