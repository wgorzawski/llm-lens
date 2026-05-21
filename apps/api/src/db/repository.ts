import { eq, desc, count, and } from "drizzle-orm";
import { db, traces } from "./index.js";
import type { UnifiedTrace, TraceProvider } from "@llm-lens/types";

export interface ListOptions {
  limit?: number;
  offset?: number;
  provider?: TraceProvider;
  userId: string;
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
  };
}

export async function insertTrace(trace: UnifiedTrace, userId: string): Promise<UnifiedTrace> {
  await db.insert(traces).values({
    id: trace.id,
    userId,
    timestamp: trace.timestamp,
    provider: trace.metadata.provider,
    model: trace.metadata.model,
    messages: JSON.stringify(trace.messages),
    usage: JSON.stringify(trace.usage),
    metadata: JSON.stringify(trace.metadata),
    raw: trace.raw !== undefined ? JSON.stringify(trace.raw) : null,
  });
  return trace;
}

export async function listTraces(opts: ListOptions): Promise<ListResult> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;

  const where = and(
    eq(traces.userId, opts.userId),
    opts.provider ? eq(traces.provider, opts.provider) : undefined,
  );

  const [rows, [{ value: total }]] = await Promise.all([
    db.select().from(traces).where(where).orderBy(desc(traces.timestamp)).limit(limit).offset(offset),
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

export async function deleteTrace(id: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(traces)
    .where(and(eq(traces.id, id), eq(traces.userId, userId)));
  return (result.rowsAffected ?? 0) > 0;
}
