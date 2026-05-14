import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { traces } from "./schema.js";

const dbUrl = process.env["DATABASE_URL"] ?? "file:./llm-lens.db";

const client = createClient({ url: dbUrl });
export const db = drizzle(client);

/** Ensure the traces table exists (idempotent). */
export async function initDb(): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS traces (
      id          TEXT    PRIMARY KEY,
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
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_traces_provider ON traces (provider)`
  );
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON traces (timestamp DESC)`
  );
}

export { traces };
