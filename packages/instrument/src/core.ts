// Shared plumbing for the provider patches: config, PII masking and fire-and-forget
// delivery. Dependency-free and platform-neutral (Node 18+ and browsers), so the
// package can also be copied into an app as a single folder.

export interface TraceContext {
  /** Label shown as the trace name, e.g. "recipe.generate" */
  name?: string;
  /** Environment, e.g. "production" - defaults to the API key's environment */
  env?: string;
  tags?: string[];
  /** Groups calls of one conversation */
  sessionId?: string;
  /** End-user id in your app */
  userId?: string;
}

/** Providers LLM Lens ingests in the OpenAI Chat Completions format */
export type OpenAICompatibleProviderId =
  | "openai"
  | "groq"
  | "gemini"
  | "mistral"
  | "deepseek"
  | "xai"
  | "openrouter"
  | "together"
  | "fireworks"
  | "perplexity"
  | "cerebras"
  | "ollama"
  | "azure-openai";

export interface LLMLensConfig {
  /** llm-lens API base URL, e.g. http://localhost:3001 */
  apiUrl: string;
  /** API key (llmlens_sk_...) or JWT used as Bearer token */
  apiKey: string;
  /**
   * Provider to record for OpenAI-compatible APIs (the OpenAI SDK pointed at another
   * baseURL). Default: "openai"
   */
  provider?: OpenAICompatibleProviderId;
  /** Set to false to pass every call straight through (kill switch). Default: true */
  enabled?: boolean;
  /** Context sent with every trace */
  metadata?: TraceContext;
  /** Called for each call to get per-call context - e.g. read from AsyncLocalStorage */
  context?: () => TraceContext | undefined;
  /** Return true to not trace a call (e.g. health pings) */
  skip?: (params: Record<string, unknown>) => boolean;
  /** Mask e-mails, phone and card numbers before sending. Default: false */
  maskPII?: boolean;
  /** Custom redaction applied to every string sent (after maskPII) */
  redact?: (text: string) => string;
  /** Give up on sending a trace after this many ms. Default: 3000 */
  timeoutMs?: number;
  /** Max traces being sent at once; more are dropped so a slow llm-lens never piles up memory. Default: 100 */
  maxInFlight?: number;
  /** Called when trace submission fails. Silent by default. */
  onError?: (err: unknown) => void;
}

export interface RawError {
  status?: number;
  message: string;
  code?: string;
  type?: string;
}

let inFlight = 0;

/** Context for one call: static metadata merged with the per-call context. Never throws. */
export function resolveContext(config: LLMLensConfig): TraceContext | undefined {
  let dynamic: TraceContext | undefined;
  try {
    dynamic = config.context?.();
  } catch (err) {
    config.onError?.(err);
  }
  const merged = { ...config.metadata, ...dynamic };
  return Object.keys(merged).length ? merged : undefined;
}

export function shouldSkip(config: LLMLensConfig, params: unknown): boolean {
  if (config.enabled === false) return true;
  if (!params || typeof params !== "object") return true;
  if ((params as { stream?: unknown }).stream) return true;
  try {
    return config.skip?.(params as Record<string, unknown>) ?? false;
  } catch {
    return false;
  }
}

/** Normalizes an SDK error (APIError, timeout, network error) into a plain object */
export function toRawError(err: unknown): RawError {
  const e = (err ?? {}) as {
    status?: unknown;
    message?: unknown;
    code?: unknown;
    type?: unknown;
    error?: { message?: unknown; code?: unknown; type?: unknown };
  };
  const status = typeof e.status === "number" ? e.status : undefined;
  const message =
    (typeof e.error?.message === "string" && e.error.message) ||
    (typeof e.message === "string" && e.message) ||
    String(err);
  const code = typeof e.code === "string" ? e.code : typeof e.error?.code === "string" ? e.error.code : undefined;
  const type = typeof e.type === "string" ? e.type : typeof e.error?.type === "string" ? e.error.type : undefined;
  return { status, message, code, type };
}

/** Sends one trace. Never throws and never blocks the caller. */
export function submit(config: LLMLensConfig, path: string, log: Record<string, unknown>): void {
  const maxInFlight = config.maxInFlight ?? 100;
  if (inFlight >= maxInFlight) {
    config.onError?.(new Error(`llm-lens: ${inFlight} traces already in flight, dropping one`));
    return;
  }
  inFlight++;
  void (async () => {
    try {
      const body = JSON.stringify(redactDeep(config, log));
      const res = await fetch(`${config.apiUrl.replace(/\/$/, "")}/api/traces/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body,
        signal: AbortSignal.timeout(config.timeoutMs ?? 3000),
      });
      if (!res.ok) {
        config.onError?.(new Error(`llm-lens submission failed: HTTP ${res.status}`));
      }
      // drain the body so the connection can be reused
      await res.arrayBuffer().catch(() => undefined);
    } catch (err) {
      config.onError?.(err);
    } finally {
      inFlight--;
    }
  })();
}

function redactDeep(config: LLMLensConfig, value: unknown): unknown {
  if (!config.maskPII && !config.redact) return value;
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === "string") {
      if (key === "id" || key === "url" || key === "tool_call_id" || key === "data") return v;
      let out = config.maskPII ? maskPII(v) : v;
      if (config.redact) out = config.redact(out);
      return out;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x, k);
      return out;
    }
    return v;
  };
  return walk(value);
}

// ── PII masking (same rules as @llm-lens/parsers maskPII) ──────────────────────

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CARD_RE = /\b\d(?:[ -]?\d){12,18}\b/g;
const PHONE_RE = /(?<![\w.])(?:\+\d{1,3}[ .-]?)?(?:\(\d{1,4}\)[ .-]?)?\d{2,4}(?:[ .-]?\d{2,4}){2,4}(?![\w.])/g;

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function looksLikePhone(match: string): boolean {
  const digits = match.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(match)) return false;
  if (/^\d+$/.test(match)) return digits.length === 9;
  return true;
}

/** Masks e-mail addresses, card numbers and phone numbers in a string */
export function maskPII(text: string): string {
  if (!text) return text;
  return text
    .replace(EMAIL_RE, "[email]")
    .replace(CARD_RE, (m) => (luhnValid(m.replace(/\D/g, "")) ? "[card]" : m))
    .replace(PHONE_RE, (m) => (looksLikePhone(m) ? "[phone]" : m));
}
