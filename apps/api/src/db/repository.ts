import { eq, gte, lte, desc, count, and, inArray, sql } from "drizzle-orm";
import { db, traces, traceNotes, client } from "./index";
import type { UnifiedTrace, TraceProvider } from "@llm-lens/types";
import { extractMessageSnippet } from "@llm-lens/parsers";
import { LATENCY_WARN_MS, LATENCY_SLOW_MS, FTS_MATCH_LIMIT, EXPORT_PAGE_SIZE } from "../constants";

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
  if ((metadata.durationMs ?? 0) >= LATENCY_WARN_MS) return "warn";
  return "ok";
}

const durationExpr = sql`json_extract(${traces.metadata}, '$.durationMs')`;

function latencyCondition(bucket: LatencyBucket | undefined) {
  switch (bucket) {
    case "fast":     return sql`${durationExpr} < 500`;
    case "med":      return sql`${durationExpr} >= 500 AND ${durationExpr} < ${LATENCY_WARN_MS}`;
    case "slow":     return sql`${durationExpr} >= ${LATENCY_WARN_MS} AND ${durationExpr} < ${LATENCY_SLOW_MS}`;
    case "verySlow": return sql`${durationExpr} >= ${LATENCY_SLOW_MS}`;
    default:         return undefined;
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
    args: [trace.id, trace.metadata.model, extractMessageSnippet(trace.messages)],
  });
  return trace;
}

export async function listTraces(opts: ListOptions): Promise<ListResult> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;

  let matchingIds: string[] | undefined;
  if (opts.q) {
    const ftsRows = await client.execute({
      sql: `SELECT id FROM traces_fts WHERE traces_fts MATCH ? LIMIT ${FTS_MATCH_LIMIT}`,
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

export async function deleteAllUserTraces(userId: string): Promise<number> {
  const rows = await db.select({ id: traces.id }).from(traces).where(eq(traces.userId, userId));
  if (rows.length === 0) return 0;
  await db.delete(traces).where(eq(traces.userId, userId));
  for (const row of rows) {
    await client.execute({ sql: `DELETE FROM traces_fts WHERE id = ?`, args: [row.id] });
  }
  return rows.length;
}

export async function* iterateAllTraces(userId: string): AsyncGenerator<UnifiedTrace> {
  const pageSize = EXPORT_PAGE_SIZE;
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

export interface ModelStats {
  model: string;
  provider: string;
  traceCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  avgDurationMs: number;
}

export interface DashboardStats {
  daily: DailyUsage[];
  byModel: ModelStats[];
  totals: {
    traceCount: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    avgDurationMs: number;
  };
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
      ORDER BY day ASC
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

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const daily = await usageByDay(userId);

  const modelResult = await client.execute({
    sql: `
      SELECT
        model,
        provider,
        COUNT(*) AS trace_count,
        SUM(json_extract(usage, '$.inputTokens')) AS input_tokens,
        SUM(json_extract(usage, '$.outputTokens')) AS output_tokens,
        SUM(COALESCE(json_extract(metadata, '$.costUsd'), 0)) AS cost_usd,
        AVG(json_extract(metadata, '$.durationMs')) AS avg_duration_ms
      FROM traces
      WHERE user_id = ?
      GROUP BY model, provider
      ORDER BY trace_count DESC
    `,
    args: [userId],
  });

  const byModel: ModelStats[] = modelResult.rows.map((r) => ({
    model: r["model"] as string,
    provider: r["provider"] as string,
    traceCount: Number(r["trace_count"]),
    inputTokens: Number(r["input_tokens"] ?? 0),
    outputTokens: Number(r["output_tokens"] ?? 0),
    costUsd: Number(r["cost_usd"] ?? 0),
    avgDurationMs: Math.round(Number(r["avg_duration_ms"] ?? 0)),
  }));

  const totals = daily.reduce(
    (acc, d) => ({
      traceCount: acc.traceCount + d.traceCount,
      inputTokens: acc.inputTokens + d.inputTokens,
      outputTokens: acc.outputTokens + d.outputTokens,
      costUsd: acc.costUsd + d.costUsd,
      avgDurationMs: 0,
    }),
    { traceCount: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, avgDurationMs: 0 }
  );

  const durationRow = await client.execute({
    sql: `SELECT AVG(json_extract(metadata, '$.durationMs')) AS avg_ms FROM traces WHERE user_id = ?`,
    args: [userId],
  });
  totals.avgDurationMs = Math.round(Number(durationRow.rows[0]?.["avg_ms"] ?? 0));

  return { daily, byModel, totals };
}

// ── Dashboard V2: timeseries + KPIs ──────────────────────────────────────────

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.ceil((sorted.length * p) / 100) - 1] ?? 0;
}

export interface DashboardV2 {
  series: {
    labels: string[];
    cost: number[];
    reqs: number[];
    p50: number[];
    p95: number[];
    p99: number[];
    errs: number[];
    split: Array<{ anthropic: number; openai: number; "vercel-ai": number }>;
  };
  kpis: {
    spend: number; spendDelta: number; spendSpark: number[];
    requests: number; requestsDelta: number; requestsSpark: number[];
    p50: number; p50Delta: number;
    p95: number; p95Delta: number; latencySpark: number[];
    errorRate: number; errorSpark: number[];
    cacheHit: number; cacheSpark: number[];
  };
  providers: Array<{ id: string; label: string; requests: number; cost: number; avgLat: number; errRate: number }>;
  models: Array<{ model: string; provider: string; requests: number; tokensK: number; p95: number; cost: number }>;
  daily: DailyUsage[];
  totals: { traceCount: number; inputTokens: number; outputTokens: number; costUsd: number; avgDurationMs: number };
}

export async function getDashboardV2(userId: string, range = "24h"): Promise<DashboardV2> {
  const now = new Date();
  const cfgMap: Record<string, { hours: number; buckets: number; bucketHours: number }> = {
    "1h":  { hours: 1,   buckets: 12, bucketHours: 1 / 12 },
    "24h": { hours: 24,  buckets: 24, bucketHours: 1 },
    "7d":  { hours: 168, buckets: 7,  bucketHours: 24 },
    "30d": { hours: 720, buckets: 30, bucketHours: 24 },
  };
  const cfg = cfgMap[range] ?? cfgMap["24h"]!;
  const bucketMs = cfg.bucketHours * 3_600_000;
  const sinceMs = now.getTime() - cfg.hours * 3_600_000;
  const prevSinceMs = sinceMs - cfg.hours * 3_600_000;

  const raw = await client.execute({
    sql: `
      SELECT timestamp, provider, model, status,
        COALESCE(json_extract(metadata, '$.durationMs'), 0) AS dur,
        COALESCE(json_extract(metadata, '$.costUsd'), 0) AS cost,
        COALESCE(json_extract(usage, '$.inputTokens'), 0) AS inp,
        COALESCE(json_extract(usage, '$.cacheReadInputTokens'), 0) AS cache
      FROM traces
      WHERE user_id = ? AND timestamp >= ?
      ORDER BY timestamp ASC
    `,
    args: [userId, new Date(prevSinceMs).toISOString()],
  });

  type R = { timestamp: string; provider: string; model: string; status: string; dur: number; cost: number; inp: number; cache: number };
  const rows: R[] = raw.rows.map((r) => ({
    timestamp: r["timestamp"] as string,
    provider: r["provider"] as string,
    model: r["model"] as string,
    status: r["status"] as string,
    dur: Number(r["dur"]),
    cost: Number(r["cost"]),
    inp: Number(r["inp"]),
    cache: Number(r["cache"]),
  }));

  const curr = rows.filter((r) => new Date(r.timestamp).getTime() >= sinceMs);
  const prev = rows.filter((r) => new Date(r.timestamp).getTime() < sinceMs);

  // ── buckets ─────────────────────────────────────────────────────────────────
  const bucketStart = now.getTime() - cfg.buckets * bucketMs;

  const mkLabel = (i: number): string => {
    const d = new Date(bucketStart + i * bucketMs);
    if (cfg.bucketHours >= 24) return d.toISOString().slice(5, 10);
    if (cfg.bucketHours < 1) return d.toISOString().slice(11, 16);
    return d.toISOString().slice(11, 13) + ":00";
  };

  type Bucket = { label: string; cost: number; reqs: number; errs: number; durs: number[]; inp: number; cache: number; split: { anthropic: number; openai: number; "vercel-ai": number } };
  const buckets: Bucket[] = Array.from({ length: cfg.buckets }, (_, i) => ({
    label: mkLabel(i), cost: 0, reqs: 0, errs: 0, durs: [], inp: 0, cache: 0,
    split: { anthropic: 0, openai: 0, "vercel-ai": 0 },
  }));

  for (const r of curr) {
    const idx = Math.min(cfg.buckets - 1, Math.floor((new Date(r.timestamp).getTime() - bucketStart) / bucketMs));
    if (idx < 0) continue;
    const b = buckets[idx]!;
    b.reqs++; b.cost += r.cost; b.inp += r.inp; b.cache += r.cache;
    if (r.status === "err") b.errs++;
    if (r.dur > 0) b.durs.push(r.dur);
    const k = r.provider as "anthropic" | "openai" | "vercel-ai";
    if (k in b.split) b.split[k]++;
  }

  // ── aggregate ───────────────────────────────────────────────────────────────
  const agg = (rs: R[]) => {
    const durs = rs.map((r) => r.dur).filter((d) => d > 0);
    const inp = rs.reduce((s, r) => s + r.inp, 0);
    const cache = rs.reduce((s, r) => s + r.cache, 0);
    return {
      spend: rs.reduce((s, r) => s + r.cost, 0),
      requests: rs.length,
      p50: pct(durs, 50), p95: pct(durs, 95),
      errs: rs.filter((r) => r.status === "err").length,
      cacheHit: inp > 0 ? (cache / inp) * 100 : 0,
    };
  };
  const d = (c: number, p: number) => (p === 0 ? 0 : ((c - p) / p) * 100);
  const c = agg(curr), p = agg(prev);

  // ── providers ───────────────────────────────────────────────────────────────
  const provMap = new Map<string, { req: number; cost: number; errs: number; durs: number[] }>();
  for (const r of curr) {
    const v = provMap.get(r.provider) ?? { req: 0, cost: 0, errs: 0, durs: [] };
    v.req++; v.cost += r.cost;
    if (r.status === "err") v.errs++;
    if (r.dur > 0) v.durs.push(r.dur);
    provMap.set(r.provider, v);
  }
  const provLabels: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", "vercel-ai": "Vercel AI" };
  const providers = [...provMap.entries()].map(([id, v]) => ({
    id, label: provLabels[id] ?? id,
    requests: v.req, cost: v.cost,
    avgLat: pct(v.durs, 50),
    errRate: v.req > 0 ? (v.errs / v.req) * 100 : 0,
  })).sort((a, b) => b.cost - a.cost);

  // ── models ──────────────────────────────────────────────────────────────────
  const modelMap = new Map<string, { provider: string; req: number; cost: number; durs: number[]; tok: number }>();
  for (const r of curr) {
    const v = modelMap.get(r.model) ?? { provider: r.provider, req: 0, cost: 0, durs: [], tok: 0 };
    v.req++; v.cost += r.cost; v.tok += r.inp;
    if (r.dur > 0) v.durs.push(r.dur);
    modelMap.set(r.model, v);
  }
  const models = [...modelMap.entries()].map(([model, v]) => ({
    model, provider: v.provider, requests: v.req,
    tokensK: Math.round(v.tok / 100) / 10,
    p95: pct(v.durs, 95), cost: v.cost,
  })).sort((a, b) => b.cost - a.cost);

  // ── daily + totals ──────────────────────────────────────────────────────────
  const daily = await usageByDay(userId);
  const totals = { ...daily.reduce(
    (acc, x) => ({ traceCount: acc.traceCount + x.traceCount, inputTokens: acc.inputTokens + x.inputTokens, outputTokens: acc.outputTokens + x.outputTokens, costUsd: acc.costUsd + x.costUsd, avgDurationMs: 0 }),
    { traceCount: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, avgDurationMs: 0 },
  ) };
  const durRow = await client.execute({ sql: `SELECT AVG(json_extract(metadata, '$.durationMs')) AS m FROM traces WHERE user_id = ?`, args: [userId] });
  totals.avgDurationMs = Math.round(Number(durRow.rows[0]?.["m"] ?? 0));

  return {
    series: {
      labels: buckets.map((b) => b.label),
      cost: buckets.map((b) => b.cost),
      reqs: buckets.map((b) => b.reqs),
      p50: buckets.map((b) => pct(b.durs, 50)),
      p95: buckets.map((b) => pct(b.durs, 95)),
      p99: buckets.map((b) => pct(b.durs, 99)),
      errs: buckets.map((b) => b.errs),
      split: buckets.map((b) => b.split),
    },
    kpis: {
      spend: c.spend, spendDelta: d(c.spend, p.spend), spendSpark: buckets.map((b) => b.cost),
      requests: c.requests, requestsDelta: d(c.requests, p.requests), requestsSpark: buckets.map((b) => b.reqs),
      p50: c.p50, p50Delta: d(c.p50, p.p50),
      p95: c.p95, p95Delta: d(c.p95, p.p95), latencySpark: buckets.map((b) => pct(b.durs, 50)),
      errorRate: c.requests > 0 ? (c.errs / c.requests) * 100 : 0,
      errorSpark: buckets.map((b) => b.errs),
      cacheHit: c.cacheHit, cacheSpark: buckets.map((b) => b.inp > 0 ? (b.cache / b.inp) * 100 : 0),
    },
    providers, models, daily, totals,
  };
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
    createdAt: Date.now(),
  };
  await db.insert(traceNotes).values(note);
  return note;
}
