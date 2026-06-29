import { randomBytes, createHash } from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import { db, apiKeys, client } from "./index";
import type { ApiKeyRow } from "./schema";

export interface ApiKeyPublic {
  id: string;
  name: string;
  env: string;
  scopes: string[];
  status: string;
  prefix: string;
  tail: string;
  lastUsedAt: number | null;
  createdAt: number;
}

export interface CreateApiKeyResult extends ApiKeyPublic {
  key: string;
}

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function envShort(env: string): string {
  if (env === "production") return "prod";
  if (env === "staging") return "stg";
  if (env === "ci") return "ci";
  return "dev";
}

function rowToPublic(r: ApiKeyRow): ApiKeyPublic {
  let scopes: string[];
  try { scopes = JSON.parse(r.scopes); } catch { scopes = ["read", "write"]; }
  return {
    id: r.id,
    name: r.name,
    env: r.env,
    scopes,
    status: r.status,
    prefix: r.prefix,
    tail: r.tail,
    lastUsedAt: r.lastUsedAt,
    createdAt: r.createdAt,
  };
}

export async function createApiKey(
  userId: string,
  name: string,
  env = "production",
  scopes: string[] = ["read", "write"],
): Promise<CreateApiKeyResult> {
  const id = crypto.randomUUID();
  const prefix = `llmlens_sk_${envShort(env)}_`;
  const raw = `${prefix}${randomBytes(24).toString("base64url")}`;
  const keyHash = hashKey(raw);
  const tail = raw.slice(-4);

  await db.insert(apiKeys).values({
    id, userId, name, keyHash,
    env, scopes: JSON.stringify(scopes), status: "active",
    prefix, tail,
  });

  return { id, name, key: raw, env, scopes, status: "active", prefix, tail, lastUsedAt: null, createdAt: Date.now() };
}

export async function listApiKeys(userId: string): Promise<ApiKeyPublic[]> {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
  return rows.map(rowToPublic);
}

export async function getApiKey(id: string, userId: string): Promise<ApiKeyPublic | null> {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
    .limit(1);
  return rows[0] ? rowToPublic(rows[0]) : null;
}

export async function updateApiKey(
  id: string,
  userId: string,
  patch: { name?: string; scopes?: string[]; status?: string },
): Promise<ApiKeyPublic | null> {
  const update: Partial<ApiKeyRow> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.scopes !== undefined) update.scopes = JSON.stringify(patch.scopes);
  if (patch.status !== undefined) update.status = patch.status;
  if (Object.keys(update).length === 0) return getApiKey(id, userId);
  await db.update(apiKeys).set(update).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
  return getApiKey(id, userId);
}

export async function rotateApiKey(id: string, userId: string): Promise<CreateApiKeyResult | null> {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
    .limit(1);
  if (!rows[0]) return null;
  const existing = rows[0];

  const raw = `${existing.prefix}${randomBytes(24).toString("base64url")}`;
  const keyHash = hashKey(raw);
  const tail = raw.slice(-4);

  await db.update(apiKeys).set({ keyHash, tail }).where(eq(apiKeys.id, id));

  return { ...rowToPublic({ ...existing, tail }), key: raw };
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
    .set({ lastUsedAt: Date.now() })
    .where(eq(apiKeys.id, id));
}

export async function deleteApiKey(id: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
  return (result.rowsAffected ?? 0) > 0;
}

// ── webhook secret ─────────────────────────────────────────────────────────────

export async function getOrCreateWebhookSecret(orgSlug: string): Promise<string> {
  const row = await client.execute({
    sql: `SELECT webhook_secret FROM orgs WHERE slug = ?`,
    args: [orgSlug],
  });
  const existing = row.rows[0]?.["webhook_secret"] as string | null;
  if (existing) return existing;
  return rotateWebhookSecret(orgSlug);
}

export async function rotateWebhookSecret(orgSlug: string): Promise<string> {
  const secret = `whsec_${randomBytes(20).toString("base64url")}`;
  await client.execute({
    sql: `UPDATE orgs SET webhook_secret = ? WHERE slug = ?`,
    args: [secret, orgSlug],
  });
  return secret;
}
