export const BCRYPT_ROUNDS = 10;
export const PENDING_2FA_TOKEN_TTL = "5m";
export const OAUTH_FETCH_TIMEOUT_MS = 10_000;
export const LATENCY_WARN_MS = 1500;
export const LATENCY_SLOW_MS = 5000;
export const FTS_MATCH_LIMIT = 500;
export const EXPORT_PAGE_SIZE = 200;
export const RETENTION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_RECOVERY_CODE_COUNT = 10;
export const ANALYTICS_PING_RATE_LIMIT = {
  max: parseInt(process.env["ANALYTICS_PING_RATE_LIMIT_MAX"] ?? "30", 10),
  timeWindow: "1 minute",
};
