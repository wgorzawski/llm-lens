import { randomBytes, createHash } from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import { db, apiKeys } from "./index.js";

export interface ApiKeyPublic {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: number;
}

export interface CreateApiKeyResult extends ApiKeyPublic {
  key: string; // plaintext — shown once, never stored
}

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function createApiKey(userId: string, name: string): Promise<CreateApiKeyResult> {
  const id = crypto.randomUUID();
  const raw = `llmlens_sk_${randomBytes(32).toString("base64url")}`;
  const keyHash = hashKey(raw);

  await db.insert(apiKeys).values({ id, userId, name, keyHash });

  return { id, name, key: raw, lastUsedAt: null, createdAt: Date.now() };
}

export async function listApiKeys(userId: string): Promise<ApiKeyPublic[]> {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    lastUsedAt: r.lastUsedAt,
    createdAt: r.createdAt,
  }));
}

export async function findApiKeyByHash(hash: string) {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);
  return rows[0] ?? null;
}

export async function touchApiKey(id: string): Promise<void> {
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(apiKeys.id, id));
}

export async function deleteApiKey(id: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
  return (result.rowsAffected ?? 0) > 0;
}
