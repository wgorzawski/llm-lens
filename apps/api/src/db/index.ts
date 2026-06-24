import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { traces, users, apiKeys } from "./schema.js";

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
  ]) {
    try { await client.execute(col); } catch { /* already exists */ }
  }

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
      last_used_at TEXT,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )
  `);
}

export { traces, users, apiKeys };
