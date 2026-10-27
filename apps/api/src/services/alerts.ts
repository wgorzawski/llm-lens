import { client } from "../db/index";
import { visibleUserIds, userIdIn } from "../db/scope";
import { notify, type Notification, type NotificationPrefs } from "./notify";

// Threshold alerts and e-mail digests, as configured in Settings -> Notifications.
// Checked every few minutes by the API process itself (no cron needed). Only production
// traffic counts: traces whose env is "production" or not set.
//
// - error rate: >= ALERT error % of calls failed in the last 10 minutes (at least 10 calls)
// - latency: p95 over the last 15 minutes above the threshold (at least 10 calls)
// - cost: today's (UTC) spend reached the daily ceiling - once per day
// Each alert fires at most once per hour; digests once per day / week.

export const ALERT_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;
const MIN_CALLS = 10;

export const DEFAULT_ALERT_THRESHOLDS = { errorRatePct: 5, latencyP95Ms: 5000, dailyCostUsd: 50 };

interface Prefs extends NotificationPrefs {
  notifications?: Record<string, boolean>;
  alertThresholds?: Partial<typeof DEFAULT_ALERT_THRESHOLDS>;
}

const PROD = `(json_extract(metadata, '$.env') IS NULL OR json_extract(metadata, '$.env') = 'production')`;

export async function initAlertState(): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS alert_state (
      user_id  TEXT    NOT NULL,
      kind     TEXT    NOT NULL,
      last_at  INTEGER NOT NULL,
      last_key TEXT,
      PRIMARY KEY (user_id, kind)
    )
  `);
}

async function getState(userId: string, kind: string): Promise<{ lastAt: number; lastKey: string | null } | null> {
  const res = await client.execute({ sql: `SELECT last_at, last_key FROM alert_state WHERE user_id = ? AND kind = ?`, args: [userId, kind] });
  const row = res.rows[0];
  return row ? { lastAt: Number(row["last_at"]), lastKey: (row["last_key"] as string | null) ?? null } : null;
}

async function setState(userId: string, kind: string, key: string | null): Promise<void> {
  await client.execute({
    sql: `INSERT INTO alert_state (user_id, kind, last_at, last_key) VALUES (?, ?, ?, ?)
          ON CONFLICT (user_id, kind) DO UPDATE SET last_at = excluded.last_at, last_key = excluded.last_key`,
    args: [userId, kind, Date.now(), key],
  });
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((sorted.length * p) / 100) - 1)] ?? 0;
}

function dashboardUrl(path = "/dashboards"): string | undefined {
  const base = process.env["FRONTEND_URL"];
  return base ? `${base.replace(/\/$/, "")}${path}` : undefined;
}

const fmtUsd = (v: number) => (v < 1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);

interface WindowStats {
  calls: number;
  errors: number;
  durations: number[];
  cost: number;
}

async function windowStats(userId: string, sinceIso: string, untilIso?: string): Promise<WindowStats> {
  const scope = userIdIn(await visibleUserIds(userId));
  const res = await client.execute({
    sql: `SELECT status,
            COALESCE(json_extract(metadata, '$.durationMs'), 0) AS dur,
            COALESCE(json_extract(metadata, '$.costUsd'), 0) AS cost
          FROM traces
          WHERE ${scope.sql} AND timestamp >= ? ${untilIso ? "AND timestamp < ?" : ""} AND ${PROD}
          LIMIT 50000`,
    args: untilIso ? [...scope.args, sinceIso, untilIso] : [...scope.args, sinceIso],
  });
  const stats: WindowStats = { calls: 0, errors: 0, durations: [], cost: 0 };
  for (const r of res.rows) {
    stats.calls++;
    if (r["status"] === "err") stats.errors++;
    const d = Number(r["dur"]);
    if (d > 0) stats.durations.push(d);
    stats.cost += Number(r["cost"]);
  }
  return stats;
}

async function fire(user: { id: string; email: string }, prefs: Prefs, n: Notification, key: string | null = null): Promise<void> {
  const state = await getState(user.id, n.kind);
  if (state && (key ? state.lastKey === key : Date.now() - state.lastAt < ALERT_COOLDOWN_MS)) return;
  await setState(user.id, n.kind, key);
  await notify(user, prefs, n);
}

/** Checks one user's alert conditions and sends what's due */
export async function checkUserAlerts(user: { id: string; email: string; preferences: string }, now = new Date()): Promise<void> {
  let prefs: Prefs;
  try {
    prefs = JSON.parse(user.preferences || "{}") as Prefs;
  } catch {
    return;
  }
  const on = { alertErr: true, alertLatency: true, alertCost: true, ...prefs.notifications };
  const t = { ...DEFAULT_ALERT_THRESHOLDS, ...prefs.alertThresholds };

  if (on.alertErr) {
    const s = await windowStats(user.id, new Date(now.getTime() - 10 * 60_000).toISOString());
    const pct = s.calls ? (s.errors / s.calls) * 100 : 0;
    if (s.calls >= MIN_CALLS && pct >= t.errorRatePct) {
      await fire(user, prefs, {
        kind: "error_rate",
        title: `Error rate ${pct.toFixed(0)}% in the last 10 minutes`,
        text: `${s.errors} of ${s.calls} production LLM calls failed (threshold ${t.errorRatePct}%).`,
        severity: "critical",
        url: dashboardUrl("/?status=err"),
        data: { calls: s.calls, errors: s.errors, errorRatePct: pct },
      });
    }
  }

  if (on.alertLatency) {
    const s = await windowStats(user.id, new Date(now.getTime() - 15 * 60_000).toISOString());
    const p95 = percentile(s.durations, 95);
    if (s.durations.length >= MIN_CALLS && p95 >= t.latencyP95Ms) {
      await fire(user, prefs, {
        kind: "latency_p95",
        title: `p95 latency ${(p95 / 1000).toFixed(1)}s in the last 15 minutes`,
        text: `p95 of ${s.durations.length} production LLM calls is ${(p95 / 1000).toFixed(1)}s (threshold ${(t.latencyP95Ms / 1000).toFixed(1)}s).`,
        severity: "warning",
        url: dashboardUrl(),
        data: { calls: s.durations.length, p95Ms: p95 },
      });
    }
  }

  if (on.alertCost && t.dailyCostUsd > 0) {
    const day = now.toISOString().slice(0, 10);
    const s = await windowStats(user.id, `${day}T00:00:00.000Z`);
    if (s.cost >= t.dailyCostUsd) {
      await fire(
        user,
        prefs,
        {
          kind: "daily_cost",
          title: `Daily cost ceiling reached: ${fmtUsd(s.cost)}`,
          text: `Production LLM spend today (UTC) is ${fmtUsd(s.cost)} across ${s.calls} calls - over your ${fmtUsd(t.dailyCostUsd)} ceiling.`,
          severity: "warning",
          url: dashboardUrl(),
          data: { day, costUsd: s.cost, calls: s.calls },
        },
        day
      );
    }
  }
}

function localParts(now: Date, timeZone: string): { date: string; hour: number; weekday: string } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(now);
    const get = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), weekday: get("weekday") };
  } catch {
    return localParts(now, "UTC");
  }
}

async function topNames(userId: string, sinceIso: string): Promise<string[]> {
  const scope = userIdIn(await visibleUserIds(userId));
  const res = await client.execute({
    sql: `SELECT COALESCE(json_extract(metadata, '$.name'), model) AS label, COUNT(*) AS n,
            SUM(COALESCE(json_extract(metadata, '$.costUsd'), 0)) AS cost,
            SUM(status = 'err') AS errs
          FROM traces WHERE ${scope.sql} AND timestamp >= ? AND ${PROD}
          GROUP BY label ORDER BY n DESC LIMIT 5`,
    args: [...scope.args, sinceIso],
  });
  return res.rows.map(
    (r) => `  - ${String(r["label"])}: ${Number(r["n"])} calls, ${fmtUsd(Number(r["cost"]))}${Number(r["errs"]) ? `, ${Number(r["errs"])} failed` : ""}`
  );
}

async function digestText(userId: string, from: Date, to: Date, label: string): Promise<string> {
  const s = await windowStats(userId, from.toISOString(), to.toISOString());
  const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
  const prev = await windowStats(userId, prevFrom.toISOString(), from.toISOString());
  const delta = (c: number, p: number) => (p ? ` (${c >= p ? "+" : ""}${(((c - p) / p) * 100).toFixed(0)}% vs previous)` : "");
  const lines = [
    `LLM Lens - ${label}`,
    "",
    `Calls:       ${s.calls}${delta(s.calls, prev.calls)}`,
    `Failed:      ${s.errors}${s.calls ? ` (${((s.errors / s.calls) * 100).toFixed(1)}%)` : ""}`,
    `Cost:        ${fmtUsd(s.cost)}${delta(s.cost, prev.cost)}`,
    `Latency p50: ${(percentile(s.durations, 50) / 1000).toFixed(2)}s, p95: ${(percentile(s.durations, 95) / 1000).toFixed(2)}s`,
  ];
  const names = await topNames(userId, from.toISOString());
  if (names.length) lines.push("", "Busiest:", ...names);
  const url = dashboardUrl();
  if (url) lines.push("", url);
  return lines.join("\n");
}

/** Daily digest at 08:00 and weekly recap on Friday 17:00, in the user's timezone (e-mail only) */
export async function checkUserDigests(
  user: { id: string; email: string; preferences: string; timezone: string },
  now = new Date()
): Promise<void> {
  let prefs: Prefs;
  try {
    prefs = JSON.parse(user.preferences || "{}") as Prefs;
  } catch {
    return;
  }
  const on = { digestDaily: true, digestWeekly: false, ...prefs.notifications };
  const local = localParts(now, user.timezone || "UTC");
  const emailOnly = { email: true, pagerduty: false };

  if (on.digestDaily && local.hour >= 8) {
    const state = await getState(user.id, "digest_daily");
    if (state?.lastKey !== local.date) {
      await setState(user.id, "digest_daily", local.date);
      const text = await digestText(user.id, new Date(now.getTime() - 24 * 3_600_000), now, `last 24 hours`);
      await notify(user, {}, { kind: "digest_daily", title: `Daily summary ${local.date}`, text, severity: "info" }, emailOnly);
    }
  }

  if (on.digestWeekly && local.weekday === "Fri" && local.hour >= 17) {
    const state = await getState(user.id, "digest_weekly");
    if (state?.lastKey !== local.date) {
      await setState(user.id, "digest_weekly", local.date);
      const text = await digestText(user.id, new Date(now.getTime() - 7 * 24 * 3_600_000), now, `last 7 days`);
      await notify(user, {}, { kind: "digest_weekly", title: `Weekly recap ${local.date}`, text, severity: "info" }, emailOnly);
    }
  }
}
