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
  displayName: text("display_name").notNull().default(""),
  handle: text("handle"),
  timezone: text("timezone").notNull().default("UTC"),
  locale: text("locale").notNull().default("en-US"),
  dateFormat: text("date_format").notNull().default("iso"),
  preferences: text("preferences").notNull().default("{}"),
  avatarUrl: text("avatar_url"),
  totpSecret: text("totp_secret"),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
  totpRecoveryCodes: text("totp_recovery_codes").notNull().default("[]"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch('now') * 1000)`),
});

export const traces = sqliteTable("traces", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  timestamp: text("timestamp").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  status: text("status").notNull().default("ok"),
  starred: integer("starred", { mode: "boolean" }).notNull().default(false),
  replayOf: text("replay_of"),
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
  env: text("env").notNull().default("production"),
  scopes: text("scopes").notNull().default('["read","write"]'),
  status: text("status").notNull().default("active"),
  prefix: text("prefix").notNull().default("llmlens_sk_"),
  tail: text("tail").notNull().default(""),
  lastUsedAt: integer("last_used_at"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch('now') * 1000)`),
});

export const traceNotes = sqliteTable("trace_notes", {
  id: text("id").primaryKey(),
  traceId: text("trace_id").notNull(),
  userId: text("user_id").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch('now') * 1000)`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  device: text("device").notNull(),
  ip: text("ip").notNull(),
  userAgent: text("user_agent").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch('now') * 1000)`),
  lastActiveAt: integer("last_active_at").notNull().default(sql`(unixepoch('now') * 1000)`),
});

export const orgs = sqliteTable("orgs", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  defaultEnv: text("default_env").notNull().default("production"),
  retentionDays: integer("retention_days").notNull().default(7),
  logoUrl: text("logo_url"),
  webhookSecret: text("webhook_secret"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch('now') * 1000)`),
});

export const orgMembers = sqliteTable("org_members", {
  id: text("id").primaryKey(),
  orgSlug: text("org_slug").notNull(),
  userId: text("user_id"),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("pending"),
  inviteToken: text("invite_token"),
  invitedAt: integer("invited_at").notNull().default(sql`(unixepoch('now') * 1000)`),
  joinedAt: integer("joined_at"),
});

export const pageviews = sqliteTable("pageviews", {
  id: text("id").primaryKey(),
  path: text("path").notNull(),
  visitorId: text("visitor_id").notNull(),
  sessionId: text("session_id").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch('now') * 1000)`),
});

export const analyticsPings = sqliteTable("analytics_pings", {
  sessionId: text("session_id").primaryKey(),
  path: text("path").notNull(),
  lastSeenAt: integer("last_seen_at").notNull().default(sql`(unixepoch('now') * 1000)`),
});

export type TraceRow = typeof traces.$inferSelect;
export type NewTraceRow = typeof traces.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type TraceNoteRow = typeof traceNotes.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type OrgRow = typeof orgs.$inferSelect;
export type OrgMemberRow = typeof orgMembers.$inferSelect;
export type PageviewRow = typeof pageviews.$inferSelect;
export type AnalyticsPingRow = typeof analyticsPings.$inferSelect;
