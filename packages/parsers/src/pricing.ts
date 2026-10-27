// Model prices in USD per 1M tokens. `cacheRead` / `cacheWrite` are the prices of cached
// input tokens; when missing, cached tokens are billed as plain input.
// Sources (checked 2026-10-27): platform.claude.com/docs/en/about-claude/pricing,
// developers.openai.com/api/docs/pricing, console.groq.com/docs/models,
// ai.google.dev/gemini-api/docs/pricing, docs.x.ai/docs/models,
// api-docs.deepseek.com/quick_start/pricing (peak rates), mistral.ai/pricing.
// Self-hosted instances can override or extend these with PRICING_FILE (see the API).

export interface ModelPrice {
  in: number;
  out: number;
  cacheRead?: number;
  cacheWrite?: number;
}

const p = (input: number, output: number, cacheRead?: number, cacheWrite?: number): ModelPrice => ({
  in: input,
  out: output,
  ...(cacheRead !== undefined ? { cacheRead } : {}),
  ...(cacheWrite !== undefined ? { cacheWrite } : {}),
});

const ANTHROPIC: Record<string, ModelPrice> = {
  "claude-fable-5-1":   p(10, 50, 0.25, 12.5),
  "claude-fable-5":     p(10, 50, 1, 12.5),
  "claude-mythos-5-1":  p(10, 50, 0.25, 12.5),
  "claude-mythos-5":    p(10, 50, 1, 12.5),
  "claude-opus-5-5":    p(4, 20, 0.2, 5),
  "claude-opus-5":      p(5, 25, 0.5, 6.25),
  "claude-opus-4-8":    p(5, 25, 0.5, 6.25),
  "claude-opus-4-7":    p(5, 25, 0.5, 6.25),
  "claude-opus-4-6":    p(5, 25, 0.5, 6.25),
  "claude-opus-4-5":    p(5, 25, 0.5, 6.25),
  "claude-opus-4-1":    p(15, 75, 1.5, 18.75),
  "claude-opus-4":      p(15, 75, 1.5, 18.75),
  "claude-sonnet-5-5":  p(2, 10, 0.1, 2.5),
  "claude-sonnet-5":    p(2, 10, 0.2, 2.5),
  "claude-sonnet-4-6":  p(3, 15, 0.3, 3.75),
  "claude-sonnet-4-5":  p(3, 15, 0.3, 3.75),
  "claude-sonnet-4":    p(3, 15, 0.3, 3.75),
  // Haiku 5.5: prompts up to 100k tokens (longer prompts cost more)
  "claude-haiku-5-5":   p(0.1, 0.5, 0.01, 0.125),
  "claude-haiku-4-5":   p(1, 5, 0.1, 1.25),
  "claude-3-5-haiku":   p(0.8, 4, 0.08, 1),
  "claude-3-5-sonnet":  p(3, 15, 0.3, 3.75),
  "claude-3-opus":      p(15, 75, 1.5, 18.75),
  "claude-3-haiku":     p(0.25, 1.25, 0.03, 0.3),
};

const OPENAI: Record<string, ModelPrice> = {
  "gpt-6-astra":   p(10, 50, 1),
  "gpt-6.1-sol":   p(2, 10, 0.1),
  "gpt-6.1-terra": p(1, 5, 0.05),
  "gpt-6-sol":     p(2, 10, 0.2),
  "gpt-6-luna":    p(0.1, 0.5, 0.01),
  "gpt-5.6-sol":   p(4, 20, 0.4),
  "gpt-5.6-terra": p(2, 12, 0.2),
  "gpt-5.6-luna":  p(0.2, 1.2, 0.02),
  "gpt-5.5":       p(5, 30, 0.5),
  "gpt-5.5-pro":   p(30, 180),
  "gpt-5.4":       p(2.5, 15, 0.25),
  "gpt-5.4-pro":   p(30, 180),
  "gpt-5.4-mini":  p(0.75, 4.5, 0.075),
  "gpt-5.4-nano":  p(0.2, 1.25, 0.02),
  "gpt-5.3-codex": p(1.75, 14, 0.175),
  "gpt-5.2":       p(1.75, 14, 0.175),
  "gpt-5.2-pro":   p(21, 168),
  "gpt-5.1":       p(1.25, 10, 0.125),
  "gpt-5":         p(1.25, 10, 0.125),
  "gpt-5-mini":    p(0.25, 2, 0.025),
  "gpt-5-nano":    p(0.05, 0.4, 0.005),
  "gpt-5-pro":     p(15, 120),
  "gpt-4.1":       p(2, 8, 0.5),
  "gpt-4.1-mini":  p(0.4, 1.6, 0.1),
  "gpt-4.1-nano":  p(0.1, 0.4, 0.025),
  "gpt-4o":        p(2.5, 10, 1.25),
  "gpt-4o-2024-05-13": p(5, 15),
  "gpt-4o-mini":   p(0.15, 0.6, 0.075),
  "gpt-4-turbo":   p(10, 30),
  "gpt-4":         p(30, 60),
  "gpt-3.5-turbo": p(0.5, 1.5),
  "o1":            p(15, 60, 7.5),
  "o1-pro":        p(150, 600),
  "o1-mini":       p(1.1, 4.4, 0.55),
  "o3":            p(2, 8, 0.5),
  "o3-pro":        p(20, 80),
  "o3-mini":       p(1.1, 4.4, 0.55),
  "o4-mini":       p(1.1, 4.4, 0.275),
  "chat-latest":   p(5, 30, 0.5),
};

const GROQ: Record<string, ModelPrice> = {
  "openai/gpt-oss-120b":          p(0.15, 0.6),
  "openai/gpt-oss-20b":           p(0.075, 0.3),
  "openai/gpt-oss-safeguard-20b": p(0.075, 0.3),
  "qwen/qwen3.8-27b":             p(0.8, 4),
  "meta-llama/llama-prompt-guard-2-22m": p(0.03, 0.03),
  "meta-llama/llama-prompt-guard-2-86m": p(0.04, 0.04),
  // legacy on-demand prices (now "contact sales")
  "llama-3.3-70b-versatile":      p(0.59, 0.79),
  "llama-3.1-8b-instant":         p(0.05, 0.08),
};

const GEMINI: Record<string, ModelPrice> = {
  "gemini-4-argon":         p(2, 10),
  "gemini-3.8-flash":       p(0.75, 3.75),
  "gemini-3.6-flash":       p(0.75, 3.75),
  "gemini-3.5-flash-lite":  p(0.3, 2.5),
  "gemini-3.1-pro-preview": p(2, 12),
  "gemini-3.1-flash-lite":  p(0.25, 1.5),
  "gemini-3-flash-preview": p(0.5, 3),
  "gemini-2.5-pro":         p(1.25, 10),
  "gemini-2.5-flash":       p(0.3, 2.5),
  "gemini-2.5-flash-lite":  p(0.1, 0.4),
};

const XAI: Record<string, ModelPrice> = {
  "grok-4.7": p(2, 6),
  "grok-4.6": p(2, 6),
  "grok-4.5": p(2, 6),
  "grok-4.3": p(1.25, 2.5),
  "grok-4.20-0309-reasoning":     p(1.25, 2.5),
  "grok-4.20-0309-non-reasoning": p(1.25, 2.5),
  "grok-build-0.1": p(1, 2),
};

const DEEPSEEK: Record<string, ModelPrice> = {
  "deepseek-flash":   p(0.3, 1.2, 0.006),
  "deepseek-v4-flash": p(0.3, 1.2, 0.006),
  "deepseek-v4-pro":  p(1.32, 3.96, 0.044),
};

const MISTRAL: Record<string, ModelPrice> = {
  "mistral-large-latest": p(0.5, 1.5),
};

const BY_PROVIDER: Record<string, Record<string, ModelPrice>> = {
  anthropic: ANTHROPIC,
  openai: OPENAI,
  "azure-openai": OPENAI,
  groq: GROQ,
  gemini: GEMINI,
  xai: XAI,
  deepseek: DEEPSEEK,
  mistral: MISTRAL,
};

const ALL_TABLES = [ANTHROPIC, OPENAI, GEMINI, XAI, DEEPSEEK, MISTRAL, GROQ];

// Prefix fallbacks for dated / unknown variants, longest prefixes first
const PREFIX_PRICES: Array<[string, ModelPrice]> = [
  ["claude-opus-4-1",  ANTHROPIC["claude-opus-4-1"]!],
  ["claude-opus-4-",   ANTHROPIC["claude-opus-4-8"]!],
  ["claude-opus",      ANTHROPIC["claude-opus-5"]!],
  ["claude-sonnet",    ANTHROPIC["claude-sonnet-4-6"]!],
  ["claude-haiku-4",   ANTHROPIC["claude-haiku-4-5"]!],
  ["claude-haiku",     ANTHROPIC["claude-haiku-5-5"]!],
  ["claude-3-5-haiku", ANTHROPIC["claude-3-5-haiku"]!],
  ["claude-3-5-sonnet", ANTHROPIC["claude-3-5-sonnet"]!],
  ["claude-3-opus",    ANTHROPIC["claude-3-opus"]!],
  ["claude-3-haiku",   ANTHROPIC["claude-3-haiku"]!],
  ["gpt-4o-mini",      OPENAI["gpt-4o-mini"]!],
  ["gpt-4o",           OPENAI["gpt-4o"]!],
  ["gpt-4.1-mini",     OPENAI["gpt-4.1-mini"]!],
  ["gpt-4.1-nano",     OPENAI["gpt-4.1-nano"]!],
  ["gpt-4.1",          OPENAI["gpt-4.1"]!],
  ["gpt-4-turbo",      OPENAI["gpt-4-turbo"]!],
  ["gpt-4",            OPENAI["gpt-4"]!],
  ["gpt-3.5",          OPENAI["gpt-3.5-turbo"]!],
  ["o1-mini",          OPENAI["o1-mini"]!],
  ["o1",               OPENAI["o1"]!],
  ["o3-mini",          OPENAI["o3-mini"]!],
  ["o3",               OPENAI["o3"]!],
  ["o4-mini",          OPENAI["o4-mini"]!],
  ["openai/gpt-oss-120b", GROQ["openai/gpt-oss-120b"]!],
  ["openai/gpt-oss-20b",  GROQ["openai/gpt-oss-20b"]!],
  ["gemini-2.5-flash-lite", GEMINI["gemini-2.5-flash-lite"]!],
  ["gemini-2.5-flash", GEMINI["gemini-2.5-flash"]!],
  ["gemini-2.5-pro",   GEMINI["gemini-2.5-pro"]!],
  ["mistral-large",    MISTRAL["mistral-large-latest"]!],
];

let overrides: Record<string, ModelPrice> = {};

/**
 * Replaces the custom price list (e.g. loaded from a JSON file). Keys are model ids,
 * optionally prefixed with the provider ("groq:openai/gpt-oss-120b"); they win over the
 * built-in tables.
 */
export function setPricingOverrides(prices: Record<string, ModelPrice>): void {
  const next: Record<string, ModelPrice> = {};
  for (const [model, price] of Object.entries(prices)) {
    if (price && typeof price.in === "number" && typeof price.out === "number") next[model.toLowerCase()] = price;
  }
  overrides = next;
}

/** Finds the price of a model, or undefined when it's unknown */
export function findPrice(model: string, provider?: string): ModelPrice | undefined {
  const m = model.toLowerCase();
  if (provider === "ollama") return overrides[`ollama:${m}`] ?? overrides[m] ?? { in: 0, out: 0 };
  const direct =
    (provider ? overrides[`${provider}:${m}`] : undefined) ??
    overrides[m] ??
    (provider ? BY_PROVIDER[provider]?.[m] : undefined);
  if (direct) return direct;
  for (const table of ALL_TABLES) if (table[m]) return table[m];
  // gateways (OpenRouter, Together...) prefix models with the vendor: "anthropic/claude-sonnet-4-6"
  const slash = m.lastIndexOf("/");
  if (slash > 0) {
    const bare = m.slice(slash + 1).replace(/\./g, "-");
    const found = findPrice(bare) ?? findPrice(m.slice(slash + 1));
    if (found) return found;
  }
  return PREFIX_PRICES.find(([prefix]) => m.startsWith(prefix))?.[1];
}

export interface CostTokens {
  /** Input tokens billed at the normal rate */
  inputTokens: number;
  outputTokens: number;
  /** Cached input tokens read (billed at cacheRead) */
  cacheReadTokens?: number;
  /** Input tokens written to the cache (billed at cacheWrite) */
  cacheWriteTokens?: number;
}

/** Cost in USD; 0 for unknown models */
export function computeCostDetailed(model: string, tokens: CostTokens, provider?: string): number {
  const price = findPrice(model, provider);
  if (!price) return 0;
  const cacheRead = tokens.cacheReadTokens ?? 0;
  const cacheWrite = tokens.cacheWriteTokens ?? 0;
  return (
    (tokens.inputTokens * price.in +
      cacheRead * (price.cacheRead ?? price.in) +
      cacheWrite * (price.cacheWrite ?? price.in) +
      tokens.outputTokens * price.out) /
    1_000_000
  );
}

/** Cost in USD from plain input / output token counts; 0 for unknown models */
export function computeCost(model: string, inputTokens: number, outputTokens: number, provider?: string): number {
  return computeCostDetailed(model, { inputTokens, outputTokens }, provider);
}
