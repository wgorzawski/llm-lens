import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch('now') * 1000)`),
});

export const traces = sqliteTable("traces", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  timestamp: text("timestamp").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  messages: text("messages").notNull(),
  usage: text("usage").notNull(),
  metadata: text("metadata").notNull(),
  raw: text("raw"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch('now') * 1000)`),
});

export type TraceRow = typeof traces.$inferSelect;
export type NewTraceRow = typeof traces.$inferInsert;
export type UserRow = typeof users.$inferSelect;
