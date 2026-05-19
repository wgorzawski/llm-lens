import { eq } from "drizzle-orm";
import { db, users } from "./index.js";

export async function createUser(email: string, passwordHash: string) {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, email, passwordHash });
  return { id, email };
}

export async function findUserByEmail(email: string) {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}
