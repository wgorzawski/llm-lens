import { eq, gte, lte, desc, count, and, inArray, sql } from "drizzle-orm";
import { db, traces, traceNotes, client } from "./index.js";
import type { UnifiedTrace, TraceProvider, TraceMessage } from "@llm-lens/types";

export type TraceSort = "recent" | "latency" | "cost" | "tokens";
export type TraceStatus = "ok" | "warn" | "err";
export type LatencyBucket = "fast" | "med" | "slow" | "verySlow";

export interface ListOptions {
  limit?: number;
  offset?: number;
  provider?: TraceProvider;
  model?: string;
  status?: TraceStatus;
  latency?: LatencyBucket;
  from?: string;
  to?: string;
  q?: string;
  sort?: TraceSort;
  userId: string;
}

function extractSnippet(messages: TraceMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "";
  if (typeof first.content === "string") return first.content.slice(0, 500);
  const block = first.content.find((b) => b.type === "text");
  return block && "text" in block ? block.text.slice(0, 500) : "";
}

function ftsEscape(q: string): string {
  return `"${q.replace(/"/g, '""')}"*`;
}

function sortOrder(sort: TraceSort | undefined) {
  switch (sort) {
    case "latency": return desc(sql`json_extract(${traces.metadata}, '$.durationMs')`);
    case "cost": return desc(sql`json_extract(${traces.metadata}, '$.costUsd')`);
    case "tokens": return desc(sql`json_extract(${traces.usage}, '$.inputTokens') + json_extract(${traces.usage}, '$.outputTokens')`);
    default: return desc(traces.timestamp);
  }
}

function deriveStatus(metadata: UnifiedTrace["metadata"]): TraceStatus {
  if (metadata.error || (metadata.statusCode && metadata.statusCode >= 400)) return "err";
  if ((metadata.durationMs ?? 0) >= 1500) return "warn";
  return "ok";
}

const durationExpr = sql`json_extract(${traces.metadata}, '$.durationMs')`;

function latencyCondition(bucket: LatencyBucket | undefined) {
  switch (bucket) {
    case "fast": return sql`${durationExpr} < 500`;
    case "med": return sql`${durationExpr} >= 500 AND ${durationExpr} < 1500`;
    case "slow": return sql`${durationExpr} >= 1500 AND ${durationExpr} < 5000`;
    case "verySlow": return sql`${durationExpr} >= 5000`;
    default: return undefined;
  }
}

export interface ListResult {
  traces: UnifiedTrace[];
  total: number;
  limit: number;
  offset: number;
}

function rowToTrace(row: typeof traces.$inferSelect): UnifiedTrace {
  return {
    id: row.id,
    timestamp: row.timestamp,
    messages: JSON.parse(row.messages),
    usage: JSON.parse(row.usage),
    metadata: JSON.parse(row.metadata),
    raw: row.raw ? JSON.parse(row.raw) : undefined,
    starred: row.starred,
    replayOf: row.replayOf ?? undefined,
  };
}

export async function insertTrace(
  trace: UnifiedTrace,
  userId: string,
  replayOf?: string
): Promise<UnifiedTrace> {
  await db.insert(traces).values({
    id: trace.id,
    userId,
    timestamp: trace.timestamp,
    provider: trace.metadata.provider,
    model: trace.metadata.model,
    status: deriveStatus(trace.metadata),
    replayOf: replayOf ?? null,
    messages: JSON.stringify(trace.messages),
    usage: JSON.stringify(trace.usage),
    metadata: JSON.stringify(trace.metadata),
    raw: trace.raw !== undefined ? JSON.stringify(trace.raw) : null,
  });
  await client.execute({
    sql: `INSERT INTO traces_fts (id, model, snippet) VALUES (?, ?, ?)`,
    args: [trace.id, trace.metadata.model, extractSnippet(trace.messages)],
  });
  return trace;
}

export async function listTraces(opts: ListOptions): Promise<ListResult> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;

  let matchingIds: string[] | undefined;
  if (opts.q) {
    const ftsRows = await client.execute({
      sql: `SELECT id FROM traces_fts WHERE traces_fts MATCH ? LIMIT 500`,
      args: [ftsEscape(opts.q)],
    });
    matchingIds = ftsRows.rows.map((r) => r["id"] as string);
    if (matchingIds.length === 0) return { traces: [], total: 0, limit, offset };
  }

  const where = and(
    eq(traces.userId, opts.userId),
    opts.provider ? eq(traces.provider, opts.provider) : undefined,
    opts.model ? eq(traces.model, opts.model) : undefined,
    opts.status ? eq(traces.status, opts.status) : undefined,
    latencyCondition(opts.latency),
    opts.from ? gte(traces.timestamp, opts.from) : undefined,
    opts.to ? lte(traces.timestamp, opts.to) : undefined,
    matchingIds ? inArray(traces.id, matchingIds) : undefined,
  );

  const [rows, [{ value: total }]] = await Promise.all([
    db.select().from(traces).where(where).orderBy(sortOrder(opts.sort)).limit(limit).offset(offset),
    db.select({ value: count() }).from(traces).where(where),
  ]);

  return { traces: rows.map(rowToTrace), total, limit, offset };
}

export async function getTrace(id: string, userId: string): Promise<UnifiedTrace | null> {
  const rows = await db
    .select()
    .from(traces)
    .where(and(eq(traces.id, id), eq(traces.userId, userId)))
    .limit(1);
  return rows[0] ? rowToTrace(rows[0]) : null;
}

export async function setStarred(id: string, userId: string, starred: boolean): Promise<UnifiedTrace | null> {
  await db
    .update(traces)
    .set({ starred })
    .where(and(eq(traces.id, id), eq(traces.userId, userId)));
  return getTrace(id, userId);
}

export async function deleteTrace(id: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(traces)
    .where(and(eq(traces.id, id), eq(traces.userId, userId)));
  await client.execute({ sql: `DELETE FROM traces_fts WHERE id = ?`, args: [id] });
  return (result.rowsAffected ?? 0) > 0;
}

export async function deleteTraces(ids: string[], userId: string): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db
    .delete(traces)
    .where(and(eq(traces.userId, userId), inArray(traces.id, ids)));
  for (const id of ids) {
    await client.execute({ sql: `DELETE FROM traces_fts WHERE id = ?`, args: [id] });
  }
  return result.rowsAffected ?? 0;
}

export async function* iterateAllTraces(userId: string): AsyncGenerator<UnifiedTrace> {
  const pageSize = 200;
  let offset = 0;
  for (;;) {
    const rows = await db
      .select()
      .from(traces)
      .where(eq(traces.userId, userId))
      .orderBy(desc(traces.timestamp))
      .limit(pageSize)
      .offset(offset);
    if (rows.length === 0) return;
    for (const row of rows) yield rowToTrace(row);
    if (rows.length < pageSize) return;
    offset += pageSize;
  }
}

export interface DailyUsage {
  day: string;
  traceCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export async function usageByDay(userId: string): Promise<DailyUsage[]> {
  const result = await client.execute({
    sql: `
      SELECT
        substr(timestamp, 1, 10) AS day,
        COUNT(*) AS trace_count,
        SUM(json_extract(usage, '$.inputTokens')) AS input_tokens,
        SUM(json_extract(usage, '$.outputTokens')) AS output_tokens,
        SUM(COALESCE(json_extract(metadata, '$.costUsd'), 0)) AS cost_usd
      FROM traces
      WHERE user_id = ?
      GROUP BY day
      ORDER BY day DESC
    `,
    args: [userId],
  });
  return result.rows.map((r) => ({
    day: r["day"] as string,
    traceCount: Number(r["trace_count"]),
    inputTokens: Number(r["input_tokens"] ?? 0),
    outputTokens: Number(r["output_tokens"] ?? 0),
    costUsd: Number(r["cost_usd"] ?? 0),
  }));
}

export async function listNotes(traceId: string) {
  return db
    .select()
    .from(traceNotes)
    .where(eq(traceNotes.traceId, traceId))
    .orderBy(desc(traceNotes.createdAt));
}

export async function addNote(traceId: string, userId: string, body: string) {
  const note = {
    id: crypto.randomUUID(),
    traceId,
    userId,
    body,
    createdAt: new Date().toISOString(),
  };
  await db.insert(traceNotes).values(note);
  return note;
}
