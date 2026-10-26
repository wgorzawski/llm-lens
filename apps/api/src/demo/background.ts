// Background traffic for the demo: full agent runs (same scenarios as the showcase,
// randomised) spread over 30 days, so lists, filters and dashboard charts look like a
// real production workload - several agents, three SDKs, realistic latency and ~3%
// failures in the middle of a run.

import {
  type AgentScript, type AnyLog, type DemoSeedContext,
  MIN, HOUR, DAY, ago, pick, randInt,
  anthropicLog, openaiLog, vercelLog, ingest, insertFailed, upToTurn,
} from "./agent";
import {
  SUPPORT_SYSTEM, SUPPORT_TOOLS, supportScripts,
  CODING_SYSTEM, CODING_TOOLS, codingScripts,
  HANDBOOK_SYSTEM, HANDBOOK_TOOLS, handbookScripts,
  ANALYST_SYSTEM, ANALYST_TOOLS, analystScripts,
  SRE_SYSTEM, SRE_TOOLS, sreScripts,
  TRAVEL_SYSTEM, TRAVEL_TOOLS, travelScripts,
} from "./scenarios";

type Kind = "support" | "coding" | "handbook" | "analyst" | "sre" | "travel";

// Relative volume per agent - support and the HR assistant are the busiest.
const KINDS: Kind[] = ["support", "support", "support", "handbook", "handbook", "coding", "analyst", "analyst", "sre", "travel"];

function render(kind: Kind, script: AgentScript, timestamp: number): AnyLog {
  const steps = script.turns.length;
  switch (kind) {
    case "support": {
      const model = Math.random() < 0.75 ? "claude-sonnet-4-6" : "claude-haiku-4-5";
      return { provider: "anthropic", log: anthropicLog(script, { model, system: SUPPORT_SYSTEM, tools: SUPPORT_TOOLS, cached: true, temperature: 0.3, maxTokens: 1024, timestamp,
        durationMs: (model === "claude-haiku-4-5" ? 900 : 1900) + steps * randInt(300, 700) }) };
    }
    case "coding": {
      const model = Math.random() < 0.8 ? "claude-sonnet-4-6" : "claude-opus-4-8";
      return { provider: "anthropic", log: anthropicLog(script, { model, system: CODING_SYSTEM, tools: CODING_TOOLS, cached: true, maxTokens: 4096, timestamp,
        durationMs: (model === "claude-opus-4-8" ? 9000 : 4500) + steps * randInt(900, 2200) }) };
    }
    case "handbook": {
      const cold = Math.random() < 0.15; // first question after the 5-minute cache expired
      return { provider: "anthropic", log: anthropicLog(script, { model: "claude-haiku-4-5", system: HANDBOOK_SYSTEM, tools: HANDBOOK_TOOLS, cached: !cold, temperature: 0, maxTokens: 800, timestamp,
        durationMs: (cold ? 1500 : 800) + steps * randInt(150, 400) }) };
    }
    case "analyst": {
      const model = Math.random() < 0.6 ? "gpt-4o-mini" : "gpt-4o";
      return { provider: "openai", log: openaiLog(script, { model, system: ANALYST_SYSTEM, tools: ANALYST_TOOLS, temperature: 0.2, timestamp,
        durationMs: 1200 + steps * randInt(500, 1400) }) };
    }
    case "sre": {
      const anthropic = Math.random() < 0.4;
      return { provider: "vercel-ai", log: vercelLog(script, {
        model: anthropic ? "claude-sonnet-4-6" : "gpt-4o-mini", provider: anthropic ? "anthropic.messages" : "openai.chat",
        system: SRE_SYSTEM, tools: SRE_TOOLS, timestamp, durationMs: 1800 + steps * randInt(600, 1500) }) };
    }
    case "travel":
      return { provider: "openai", log: openaiLog(script, { model: "gpt-4o", system: TRAVEL_SYSTEM, tools: TRAVEL_TOOLS, temperature: 0.4, timestamp,
        durationMs: 1600 + steps * randInt(400, 900) }) };
  }
}

function newScript(kind: Kind): AgentScript {
  const factories = {
    support: supportScripts, coding: codingScripts, handbook: handbookScripts,
    analyst: analystScripts, sre: sreScripts, travel: travelScripts,
  }[kind];
  return pick(factories)();
}

const FAILURES = [
  { statusCode: 429, error: "rate_limit_error: Number of request tokens has exceeded your per-minute rate limit.", durationMs: [180, 450] },
  { statusCode: 529, error: "overloaded_error: Overloaded", durationMs: [300, 900] },
  { statusCode: 500, error: "api_error: Internal server error", durationMs: [400, 1200] },
  { statusCode: 504, error: "Request timed out after 60000 ms", durationMs: [60000, 60000] },
] as const;

async function seedRun(ctx: DemoSeedContext, timestamp: number): Promise<void> {
  const kind = pick(KINDS);
  const script = newScript(kind);

  if (script.turns.length >= 2 && Math.random() < 0.04) {
    // The run failed partway: the request that errored carries the turns so far.
    const f = pick(FAILURES);
    const cut = upToTurn(script, randInt(1, script.turns.length - 1));
    await insertFailed(ctx, render(kind, cut, timestamp), { statusCode: f.statusCode, error: f.error, durationMs: randInt(f.durationMs[0], f.durationMs[1]) });
    return;
  }
  await ingest(ctx, render(kind, script, timestamp));
}

export async function seedBackground(ctx: DemoSeedContext): Promise<void> {
  // 29 days of history: weekdays busier than weekends, slight growth towards today.
  for (let d = 29; d >= 1; d--) {
    const day = new Date(ago(d * DAY));
    const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    const perDay = weekend ? randInt(1, 3) : randInt(3, 5) + Math.round((29 - d) / 12);
    for (let i = 0; i < perDay; i++) await seedRun(ctx, ago(d * DAY + randInt(0, 23 * HOUR)));
  }
  // Last 24 hours, hour by hour, for the 24h dashboard view. Stops 4 hours ago,
  // where the showcase traces take over.
  for (let h = 23; h >= 4; h--) {
    const perHour = h <= 9 ? randInt(0, 1) : randInt(1, 3);
    for (let i = 0; i < perHour; i++) await seedRun(ctx, ago(h * HOUR + randInt(1, 59) * MIN));
  }
}
