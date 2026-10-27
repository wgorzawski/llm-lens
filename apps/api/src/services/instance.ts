import { readFileSync } from "node:fs";
import { setPricingOverrides, type ModelPrice } from "@llm-lens/parsers";

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

/**
 * PRICING_FILE: JSON map of model -> { in, out, cacheRead?, cacheWrite? } in USD per 1M
 * tokens, for models the built-in price list doesn't know (fine-tunes, self-hosted, new
 * releases). Keys may be prefixed with a provider: "together:meta-llama/Llama-3.3-70B".
 */
export function loadPricingOverrides(log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void }): void {
  const file = process.env["PRICING_FILE"];
  if (!file) return;
  try {
    const prices = JSON.parse(readFileSync(file, "utf8")) as Record<string, ModelPrice>;
    setPricingOverrides(prices);
    log.info({ file, models: Object.keys(prices).length }, "custom model prices loaded");
  } catch (err) {
    log.error({ err, file }, "could not load PRICING_FILE - using built-in prices");
  }
}
