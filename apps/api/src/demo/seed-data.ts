// Demo seed entry point. Used by the API itself in DEMO_MODE
// (services/demo-maintenance.ts) to fill the shared demo account. Traces go through the
// real ingest routes (via server.inject), so they are parsed exactly like real ones;
// failed calls and replays can't be produced by ingest, so those are inserted directly.
//
// Content lives in showcase.ts (hand-written first page), background.ts (30 days of
// traffic) and scenarios.ts (prompts, tools, agent scripts).
//
// Bump DEMO_SEED_VERSION whenever the content changes - the API then replaces the demo
// account's traces on its next start (visitor accounts are left alone).

import type { DemoSeedContext } from "./agent";
import { seedShowcase } from "./showcase";
import { seedBackground } from "./background";

export type { DemoApiCall, DemoSeedContext } from "./agent";

export const DEMO_SEED_VERSION = 4;

export async function seedDemoData(ctx: DemoSeedContext): Promise<void> {
  const { starred, notes } = await seedShowcase(ctx);
  await seedBackground(ctx);

  for (const id of starred) await ctx.api("PATCH", `/traces/${id}`, { starred: true });
  for (const [id, body] of notes) await ctx.api("POST", `/traces/${id}/notes`, { body });

  // A re-seed keeps the account's existing keys.
  const keys = (await ctx.api("GET", "/keys")) as unknown[];
  if (keys.length === 0) {
    await ctx.api("POST", "/keys", { name: "production", env: "production", scopes: ["read", "write"] });
    await ctx.api("POST", "/keys", { name: "staging", env: "staging", scopes: ["read", "write"] });
    await ctx.api("POST", "/keys", { name: "ci", env: "ci", scopes: ["read"] });
  }
}
