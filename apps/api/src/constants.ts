export const BCRYPT_ROUNDS = 10;
export const PENDING_2FA_TOKEN_TTL = "5m";
export const OAUTH_FETCH_TIMEOUT_MS = 10_000;
export const LATENCY_WARN_MS = 1500;
export const LATENCY_SLOW_MS = 5000;
export const FTS_MATCH_LIMIT = 500;
export const EXPORT_PAGE_SIZE = 200;
export const RETENTION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const DEMO_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
export const DEMO_MIN_RETENTION_DAYS = 30;
// Shared public demo login - must match apps/web (login page demo button, useDemoGuard).
export const DEMO_EMAIL = (process.env["DEMO_EMAIL"] ?? "demo@llmlens.dev").toLowerCase();
export const DEMO_PASSWORD = "demo1234";
export const DEMO_ORG_NAME = "LLM Lens Demo";
// Below this many traces the demo account is considered emptied and gets re-seeded.
export const DEMO_MIN_TRACES = 10;
export const DEFAULT_RECOVERY_CODE_COUNT = 10;
export const ANALYTICS_PING_RATE_LIMIT = {
  max: parseInt(process.env["ANALYTICS_PING_RATE_LIMIT_MAX"] ?? "30", 10),
  timeWindow: "1 minute",
};
