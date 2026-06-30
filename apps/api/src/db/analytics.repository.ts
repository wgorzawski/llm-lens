import { client } from "./index";

const LIVE_WINDOW_MS = 60_000;

export interface DailyViews {
  day: string;
  views: number;
}

export interface AnalyticsStats {
  totalViews: number;
  uniqueVisitors: number;
  live: number;
  series: DailyViews[];
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

export async function getStats(days: number): Promise<AnalyticsStats> {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  const totalsResult = await client.execute({
    sql: `
      SELECT COUNT(*) AS total_views, COUNT(DISTINCT visitor_id) AS unique_visitors
      FROM pageviews
      WHERE created_at > ?
    `,
    args: [since],
  });

  const seriesResult = await client.execute({
    sql: `
      SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS views
      FROM pageviews
      WHERE created_at > ?
      GROUP BY day
      ORDER BY day ASC
    `,
    args: [since],
  });

  const live = await getLiveCount();

  return {
    totalViews: Number(totalsResult.rows[0]?.["total_views"] ?? 0),
    uniqueVisitors: Number(totalsResult.rows[0]?.["unique_visitors"] ?? 0),
    live,
    series: seriesResult.rows.map((r) => ({ day: r["day"] as string, views: Number(r["views"]) })),
  };
}
