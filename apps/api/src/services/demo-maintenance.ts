import type { FastifyInstance } from "fastify";
import { client } from "../db/index";
import { insertTrace, deleteAllUserTraces } from "../db/repository";
import { findUserById, updatePreferences } from "../db/users.repository";
import { DEMO_MIN_TRACES } from "../constants";
import { DEMO_SEED_VERSION, seedDemoData } from "../demo/seed-data";
import { ensureDemoAccount } from "./demo-account";
import { refreshDemoTimestamps } from "./demo-refresh";

let running = false;

async function countTraces(userId: string): Promise<number> {
  const { rows } = await client.execute({ sql: `SELECT COUNT(*) AS n FROM traces WHERE user_id = ?`, args: [userId] });
  return Number(rows[0]?.["n"] ?? 0);
}

// Runs at startup and hourly in DEMO_MODE. Repairs the demo account, (re-)seeds it
// when its data is gone or the seed content changed (DEMO_SEED_VERSION), then shifts
// timestamps so the newest trace is "now". The public demo therefore recovers by
// itself instead of waiting for a manual re-seed.
export async function runDemoMaintenance(server: FastifyInstance): Promise<void> {
  if (running) return; // a slow seed must not overlap with the next hourly run
  running = true;
  try {
    const demo = await ensureDemoAccount();
    const user = await findUserById(demo.id);
    const seededVersion = (JSON.parse(user?.preferences ?? "{}") as { demoSeedVersion?: number }).demoSeedVersion;
    const traceCount = await countTraces(demo.id);

    if (traceCount < DEMO_MIN_TRACES || seededVersion !== DEMO_SEED_VERSION) {
      server.log.warn({ traceCount, seededVersion, version: DEMO_SEED_VERSION }, "re-seeding demo account");
      await deleteAllUserTraces(demo.id);
      await client.execute({ sql: `DELETE FROM trace_notes WHERE user_id = ?`, args: [demo.id] });

      const token = server.jwt.sign({ userId: demo.id, email: demo.email });
      await seedDemoData({
        api: async (method, path, body) => {
          const res = await server.inject({
            method: method as "GET" | "POST" | "PATCH" | "DELETE",
            url: `/api${path}`,
            headers: { authorization: `Bearer ${token}` },
            ...(body === undefined ? {} : { payload: body as object }),
          });
          if (res.statusCode >= 400) throw new Error(`${method} ${path} -> ${res.statusCode}: ${res.body}`);
          return res.body ? res.json() : null;
        },
        insertTrace: async (trace, replayOf) => {
          await insertTrace(trace, demo.id, replayOf);
        },
      });
      await updatePreferences(demo.id, { demoSeedVersion: DEMO_SEED_VERSION });
      server.log.info({ traces: await countTraces(demo.id), version: DEMO_SEED_VERSION }, "demo account seeded");
    }

    await refreshDemoTimestamps();
  } finally {
    running = false;
  }
}
