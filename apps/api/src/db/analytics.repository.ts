import { client } from "./index";

const LIVE_WINDOW_MS = 60_000;

const RANGE_CFG: Record<string, { hours: number; buckets: number; bucketHours: number }> = {
  "1h":  { hours: 1,   buckets: 12, bucketHours: 1 / 12 },
  "24h": { hours: 24,  buckets: 24, bucketHours: 1 },
  "7d":  { hours: 168, buckets: 7,  bucketHours: 24 },
  "30d": { hours: 720, buckets: 30, bucketHours: 24 },
};

export interface AnalyticsStats {
  totalViews: number;
  uniqueVisitors: number;
  live: number;
  series: { labels: string[]; views: number[] };
}

export async function recordPageview(path: string, visitorId: string, sessionId: string): Promise<void> {
  await client.execute({
    sql: `INSERT INTO pageviews (id, path, visitor_id, session_id) VALUES (?, ?, ?, ?)`,
    args: [crypto.randomUUID(), path, visitorId, sessionId],
  });
}

export async function touchPing(sessionId: string, path: string): Promise<void> {
  await client.execute({
    sql: `
      INSERT INTO analytics_pings (session_id, path, last_seen_at) VALUES (?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET path = excluded.path, last_seen_at = excluded.last_seen_at
    `,
    args: [sessionId, path, Date.now()],
  });
}

export async function getLiveCount(): Promise<number> {
  const result = await client.execute({
    sql: `SELECT COUNT(*) AS live FROM analytics_pings WHERE last_seen_at > ?`,
    args: [Date.now() - LIVE_WINDOW_MS],
  });
  return Number(result.rows[0]?.["live"] ?? 0);
}

export async function getStats(range: string): Promise<AnalyticsStats> {
  const cfg = RANGE_CFG[range] ?? RANGE_CFG["24h"]!;
  const bucketMs = cfg.bucketHours * 3_600_000;
  const now = Date.now();
  const since = now - cfg.hours * 3_600_000;

  const totalsResult = await client.execute({
    sql: `
      SELECT COUNT(*) AS total_views, COUNT(DISTINCT visitor_id) AS unique_visitors
      FROM pageviews
      WHERE created_at > ?
    `,
    args: [since],
  });

  const rowsResult = await client.execute({
    sql: `SELECT created_at FROM pageviews WHERE created_at > ? ORDER BY created_at ASC`,
    args: [since],
  });

  const bucketStart = now - cfg.buckets * bucketMs;
  const mkLabel = (i: number): string => {
    const d = new Date(bucketStart + i * bucketMs);
    if (cfg.bucketHours >= 24) return d.toISOString().slice(5, 10);
    if (cfg.bucketHours < 1) return d.toISOString().slice(11, 16);
    return `${d.toISOString().slice(11, 13)}:00`;
  };

  const labels = Array.from({ length: cfg.buckets }, (_, i) => mkLabel(i));
  const views = new Array(cfg.buckets).fill(0) as number[];
  for (const r of rowsResult.rows) {
    const idx = Math.min(cfg.buckets - 1, Math.floor((Number(r["created_at"]) - bucketStart) / bucketMs));
    if (idx < 0) continue;
    views[idx]!++;
  }

  const live = await getLiveCount();

  return {
    totalViews: Number(totalsResult.rows[0]?.["total_views"] ?? 0),
    uniqueVisitors: Number(totalsResult.rows[0]?.["unique_visitors"] ?? 0),
    live,
    series: { labels, views },
  };
}
