// Instance-wide settings read from the environment. A self-hosted / production
// instance usually closes sign-ups and keeps data longer than the hosted defaults.

/** REGISTRATION_ENABLED=false closes sign-ups (e-mail and OAuth); invited people can still join */
export const registrationEnabled = process.env["REGISTRATION_ENABLED"] !== "false";

/** Retention for new organizations, in days; 0 keeps traces forever */
export const defaultRetentionDays = (() => {
  const raw = process.env["DEFAULT_RETENTION_DAYS"];
  const n = raw === undefined || raw === "" ? 7 : parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 7;
})();

/** Max request body, in bytes - long prompts (e.g. a whole web page) easily exceed Fastify's 1 MB */
export const bodyLimitBytes = (() => {
  const mb = parseFloat(process.env["BODY_LIMIT_MB"] ?? "10");
  return Math.round((Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024);
})();
