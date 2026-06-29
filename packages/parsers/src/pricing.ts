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

export function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const m = model.toLowerCase();
  const price = PRICES[m] ?? PREFIX_PRICES.find(([p]) => m.startsWith(p))?.[1];
  if (!price) return 0;
  return (inputTokens * price.in + outputTokens * price.out) / 1_000_000;
}
