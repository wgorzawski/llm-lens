import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const traces = sqliteTable("traces", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  messages: text("messages").notNull(),   // JSON
  usage: text("usage").notNull(),         // JSON
  metadata: text("metadata").notNull(),   // JSON
  raw: text("raw"),                       // JSON, nullable
  createdAt: integer("created_at").notNull().default(sql`(unixepoch('now') * 1000)`),
});

export type TraceRow = typeof traces.$inferSelect;
export type NewTraceRow = typeof traces.$inferInsert;
