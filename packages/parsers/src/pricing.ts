// Pricing in USD per 1M tokens (input / output).
// Sources: public pricing pages, updated 2026-06.
const PRICES: Record<string, { in: number; out: number }> = {
  // Anthropic Claude 4.x
  "claude-opus-4-8":       { in: 15.0,  out: 75.0 },
  "claude-opus-4-7":       { in: 15.0,  out: 75.0 },
  "claude-sonnet-4-6":     { in: 3.0,   out: 15.0 },
  "claude-sonnet-4-5":     { in: 3.0,   out: 15.0 },
  "claude-haiku-4-5":      { in: 0.25,  out: 1.25 },
  "claude-haiku-4-5-20251001": { in: 0.25, out: 1.25 },
  // Anthropic Claude 3.x
  "claude-3-opus-20240229":   { in: 15.0,  out: 75.0 },
  "claude-3-5-sonnet-20241022": { in: 3.0, out: 15.0 },
  "claude-3-5-sonnet-20240620": { in: 3.0, out: 15.0 },
  "claude-3-5-haiku-20241022":  { in: 0.8,  out: 4.0 },
  "claude-3-haiku-20240307":    { in: 0.25, out: 1.25 },
  // OpenAI GPT-4o family
  "gpt-4o":                { in: 2.5,   out: 10.0 },
  "gpt-4o-2024-08-06":     { in: 2.5,   out: 10.0 },
  "gpt-4o-2024-11-20":     { in: 2.5,   out: 10.0 },
  "gpt-4o-mini":           { in: 0.15,  out: 0.6 },
  "gpt-4o-mini-2024-07-18":{ in: 0.15,  out: 0.6 },
  "gpt-4-turbo":           { in: 10.0,  out: 30.0 },
  "gpt-4-turbo-2024-04-09":{ in: 10.0,  out: 30.0 },
  "gpt-4":                 { in: 30.0,  out: 60.0 },
  "gpt-3.5-turbo":         { in: 0.5,   out: 1.5 },
  "gpt-3.5-turbo-0125":    { in: 0.5,   out: 1.5 },
  // OpenAI o-series
  "o3":                    { in: 10.0,  out: 40.0 },
  "o3-mini":               { in: 1.1,   out: 4.4 },
  "o1":                    { in: 15.0,  out: 60.0 },
  "o1-mini":               { in: 1.1,   out: 4.4 },
  "o4-mini":               { in: 1.1,   out: 4.4 },
};

// Prefix fallbacks for unknown model variants
const PREFIX_PRICES: Array<[string, { in: number; out: number }]> = [
  ["claude-opus",   { in: 15.0, out: 75.0 }],
  ["claude-sonnet", { in: 3.0,  out: 15.0 }],
  ["claude-haiku",  { in: 0.25, out: 1.25 }],
  ["claude-",       { in: 3.0,  out: 15.0 }],
  ["gpt-4o-mini",   { in: 0.15, out: 0.6 }],
  ["gpt-4o",        { in: 2.5,  out: 10.0 }],
  ["gpt-4",         { in: 10.0, out: 30.0 }],
  ["gpt-3.5",       { in: 0.5,  out: 1.5 }],
  ["o1-mini",       { in: 1.1,  out: 4.4 }],
  ["o1",            { in: 15.0, out: 60.0 }],
  ["o3-mini",       { in: 1.1,  out: 4.4 }],
  ["o3",            { in: 10.0, out: 40.0 }],
];

// Groq (OpenAI-compatible API). Model ids overlap with OpenAI's open-weight releases
// ("openai/gpt-oss-120b"), so Groq traces are priced from this table first.
// Source: groq.com/pricing, checked 2026-10-27 (on-demand prices; free tier is $0).
const GROQ_PRICES: Record<string, { in: number; out: number }> = {
  "openai/gpt-oss-120b":                    { in: 0.15, out: 0.6 },
  "openai/gpt-oss-20b":                     { in: 0.075, out: 0.3 },
  "openai/gpt-oss-safeguard-20b":           { in: 0.075, out: 0.3 },
  "llama-3.3-70b-versatile":                { in: 0.59, out: 0.79 },
  "llama-3.1-8b-instant":                   { in: 0.05, out: 0.08 },
  "meta-llama/llama-4-scout-17b-16e-instruct":    { in: 0.11, out: 0.34 },
  "meta-llama/llama-4-maverick-17b-128e-instruct": { in: 0.2, out: 0.6 },
  "moonshotai/kimi-k2-instruct":            { in: 1.0, out: 3.0 },
  "moonshotai/kimi-k2-instruct-0905":       { in: 1.0, out: 3.0 },
  "qwen/qwen3-32b":                         { in: 0.29, out: 0.59 },
  "qwen/qwen3.8-27b":                       { in: 0.8, out: 4.0 },
};

const GROQ_PREFIX_PRICES: Array<[string, { in: number; out: number }]> = [
  ["openai/gpt-oss-120b", { in: 0.15, out: 0.6 }],
  ["openai/gpt-oss-20b",  { in: 0.075, out: 0.3 }],
];

export function computeCost(model: string, inputTokens: number, outputTokens: number, provider?: string): number {
  const m = model.toLowerCase();
  const price =
    (provider === "groq" ? GROQ_PRICES[m] ?? GROQ_PREFIX_PRICES.find(([p]) => m.startsWith(p))?.[1] : undefined) ??
    PRICES[m] ??
    GROQ_PRICES[m] ??
    PREFIX_PRICES.find(([p]) => m.startsWith(p))?.[1];
  if (!price) return 0;
  return (inputTokens * price.in + outputTokens * price.out) / 1_000_000;
}
