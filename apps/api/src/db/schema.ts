import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull().default(""),
  provider: text("provider").notNull().default("email"),
  providerId: text("provider_id"),
  org: text("org").notNull().default("personal"),
  plan: text("plan").notNull().default("free"),
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

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  lastUsedAt: text("last_used_at"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch('now') * 1000)`),
});

export type TraceRow = typeof traces.$inferSelect;
export type NewTraceRow = typeof traces.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
