import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { traces, users, apiKeys, traceNotes, sessions, orgs, orgMembers, pageviews, analyticsPings } from "./schema";

const dbUrl = process.env["DATABASE_URL"] ?? "file:./llm-lens.db";

const client = createClient({ url: dbUrl });
export const db = drizzle(client);

export async function initDb(): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT    PRIMARY KEY,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL DEFAULT '',
      provider      TEXT    NOT NULL DEFAULT 'email',
      provider_id   TEXT,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )
  `);

  for (const col of [
    `ALTER TABLE users ADD COLUMN provider TEXT NOT NULL DEFAULT 'email'`,
    `ALTER TABLE users ADD COLUMN provider_id TEXT`,
    `ALTER TABLE users ADD COLUMN org TEXT NOT NULL DEFAULT 'personal'`,
    `ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'`,
    `ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN handle TEXT`,
    `ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC'`,
    `ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'en-US'`,
    `ALTER TABLE users ADD COLUMN date_format TEXT NOT NULL DEFAULT 'iso'`,
    `ALTER TABLE users ADD COLUMN preferences TEXT NOT NULL DEFAULT '{}'`,
    `ALTER TABLE users ADD COLUMN avatar_url TEXT`,
    `ALTER TABLE users ADD COLUMN totp_secret TEXT`,
    `ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN totp_recovery_codes TEXT NOT NULL DEFAULT '[]'`,
  ]) {
    try { await client.execute(col); } catch { /* already exists */ }
  }

  await client.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle ON users (handle)`
  );

  await client.execute(`
    CREATE TABLE IF NOT EXISTS traces (
      id          TEXT    PRIMARY KEY,
      user_id     TEXT    NOT NULL DEFAULT '',
      timestamp   TEXT    NOT NULL,
      provider    TEXT    NOT NULL,
      model       TEXT    NOT NULL,
      messages    TEXT    NOT NULL,
      usage       TEXT    NOT NULL,
      metadata    TEXT    NOT NULL,
      raw         TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )
  `);

  for (const col of [
    `ALTER TABLE traces ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE traces ADD COLUMN status TEXT NOT NULL DEFAULT 'ok'`,
    `ALTER TABLE traces ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE traces ADD COLUMN replay_of TEXT`,
  ]) {
    try { await client.execute(col); } catch { /* already exists */ }
  }

  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_traces_user_id ON traces (user_id)`
  );
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_traces_provider ON traces (provider)`
  );
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON traces (timestamp DESC)`
  );
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_traces_status ON traces (status)`
  );

  await client.execute(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id           TEXT    PRIMARY KEY,
      user_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name         TEXT    NOT NULL,
      key_hash     TEXT    NOT NULL UNIQUE,
      env          TEXT    NOT NULL DEFAULT 'production',
      scopes       TEXT    NOT NULL DEFAULT '["read","write"]',
      status       TEXT    NOT NULL DEFAULT 'active',
      prefix       TEXT    NOT NULL DEFAULT 'llmlens_sk_',
      tail         TEXT    NOT NULL DEFAULT '',
      last_used_at INTEGER,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )
  `);

  for (const col of [
    `ALTER TABLE api_keys ADD COLUMN env TEXT NOT NULL DEFAULT 'production'`,
    `ALTER TABLE api_keys ADD COLUMN scopes TEXT NOT NULL DEFAULT '["read","write"]'`,
    `ALTER TABLE api_keys ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE api_keys ADD COLUMN prefix TEXT NOT NULL DEFAULT 'llmlens_sk_'`,
    `ALTER TABLE api_keys ADD COLUMN tail TEXT NOT NULL DEFAULT ''`,
  ]) {
    try { await client.execute(col); } catch { /* already exists */ }
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS trace_notes (
      id         TEXT NOT NULL PRIMARY KEY,
      trace_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      body       TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )
  `);
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_trace_notes_trace_id ON trace_notes (trace_id)`
  );

  await client.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id              TEXT    NOT NULL PRIMARY KEY,
      user_id         TEXT    NOT NULL,
      device          TEXT    NOT NULL,
      ip              TEXT    NOT NULL,
      user_agent      TEXT    NOT NULL,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      last_active_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )
  `);
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)`
  );

  await client.execute(`
    CREATE TABLE IF NOT EXISTS orgs (
      slug           TEXT    PRIMARY KEY,
      name           TEXT    NOT NULL,
      default_env    TEXT    NOT NULL DEFAULT 'production',
      retention_days INTEGER NOT NULL DEFAULT 7,
      created_at     INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )
  `);

  for (const col of [
    `ALTER TABLE orgs ADD COLUMN retention_days INTEGER NOT NULL DEFAULT 7`,
    `ALTER TABLE orgs ADD COLUMN logo_url TEXT`,
    `ALTER TABLE orgs ADD COLUMN webhook_secret TEXT`,
  ]) {
    try { await client.execute(col); } catch { /* already exists */ }
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS org_members (
      id           TEXT    PRIMARY KEY,
      org_slug     TEXT    NOT NULL,
      user_id      TEXT,
      email        TEXT    NOT NULL,
      role         TEXT    NOT NULL DEFAULT 'member',
      status       TEXT    NOT NULL DEFAULT 'pending',
      invite_token TEXT,
      invited_at   INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      joined_at    INTEGER
    )
  `);
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_org_members_org_slug ON org_members (org_slug)`
  );
  await client.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_invite_token ON org_members (invite_token) WHERE invite_token IS NOT NULL`
  );

  await client.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS traces_fts USING fts5(
      id UNINDEXED,
      model,
      snippet
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS pageviews (
      id          TEXT    NOT NULL PRIMARY KEY,
      path        TEXT    NOT NULL,
      visitor_id  TEXT    NOT NULL,
      session_id  TEXT    NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )
  `);
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_pageviews_created_at ON pageviews (created_at)`
  );

  await client.execute(`
    CREATE TABLE IF NOT EXISTS analytics_pings (
      session_id    TEXT    NOT NULL PRIMARY KEY,
      path          TEXT    NOT NULL,
      last_seen_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )
  `);
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_analytics_pings_last_seen_at ON analytics_pings (last_seen_at)`
  );
}

export { traces, users, apiKeys, traceNotes, sessions, orgs, orgMembers, pageviews, analyticsPings, client };
