import { eq, and, ne } from "drizzle-orm";
import { db, users } from "./index";

export async function createUser(email: string, passwordHash: string, provider = "email", providerId?: string) {
  const id = crypto.randomUUID();
  const org = `org-${id.slice(0, 8)}`;
  await db.insert(users).values({ id, email, passwordHash, provider, providerId: providerId ?? null, org });
  return { id, email };
}

export async function findUserByEmail(email: string) {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: string) {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findUserByHandle(handle: string, excludeUserId: string) {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.handle, handle), ne(users.id, excludeUserId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findOrCreateOAuthUser(email: string, provider: string, providerId: string) {
  const existing = await findUserByEmail(email);
  if (existing) return { id: existing.id, email: existing.email };
  return createUser(email, "", provider, providerId);
}

export interface ProfileUpdate {
  displayName?: string;
  handle?: string | null;
  timezone?: string;
  locale?: string;
  dateFormat?: string;
}

export async function updateProfile(userId: string, update: ProfileUpdate) {
  await db.update(users).set(update).where(eq(users.id, userId));
  return findUserById(userId);
}

export async function updatePasswordHash(userId: string, passwordHash: string) {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function updateUserOrgSlug(userId: string, org: string) {
  await db.update(users).set({ org }).where(eq(users.id, userId));
}

export async function updatePreferences(userId: string, preferences: Record<string, unknown>) {
  const user = await findUserById(userId);
  if (!user) return null;
  const merged = { ...JSON.parse(user.preferences), ...preferences };
  await db.update(users).set({ preferences: JSON.stringify(merged) }).where(eq(users.id, userId));
  return merged;
}

export async function setPendingTotpSecret(userId: string, secret: string) {
  await db.update(users).set({ totpSecret: secret, totpEnabled: false }).where(eq(users.id, userId));
}

export async function enableTotp(userId: string, recoveryCodeHashes: string[]) {
  await db
    .update(users)
    .set({ totpEnabled: true, totpRecoveryCodes: JSON.stringify(recoveryCodeHashes) })
    .where(eq(users.id, userId));
}

export async function disableTotp(userId: string) {
  await db
    .update(users)
    .set({ totpEnabled: false, totpSecret: null, totpRecoveryCodes: "[]" })
    .where(eq(users.id, userId));
}

export async function consumeRecoveryCode(userId: string, codeHash: string): Promise<boolean> {
  const user = await findUserById(userId);
  if (!user) return false;
  const codes: string[] = JSON.parse(user.totpRecoveryCodes);
  if (!codes.includes(codeHash)) return false;
  await db
    .update(users)
    .set({ totpRecoveryCodes: JSON.stringify(codes.filter((c) => c !== codeHash)) })
    .where(eq(users.id, userId));
  return true;
}
