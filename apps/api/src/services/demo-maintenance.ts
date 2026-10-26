import type { FastifyInstance } from "fastify";
import { client } from "../db/index";
import { DEMO_MIN_TRACES } from "../constants";
import { seedDemoData } from "../demo/seed-data";
import { ensureDemoAccount } from "./demo-account";
import { refreshDemoTimestamps } from "./demo-refresh";

let running = false;

// Runs at startup and hourly in DEMO_MODE. Repairs the demo account, re-seeds it when
// its data is gone, then shifts timestamps so the newest trace is "now". The public
// demo therefore recovers by itself instead of waiting for a manual re-seed.
export async function runDemoMaintenance(server: FastifyInstance): Promise<void> {
  if (running) return; // a slow seed must not overlap with the next hourly run
  running = true;
  try {
    const demo = await ensureDemoAccount();

    const { rows } = await client.execute({
      sql: `SELECT COUNT(*) AS n FROM traces WHERE user_id = ?`,
      args: [demo.id],
    });
    const traceCount = Number(rows[0]?.["n"] ?? 0);

    if (traceCount < DEMO_MIN_TRACES) {
      server.log.warn({ traceCount }, "demo account has (almost) no traces - re-seeding");
      const token = server.jwt.sign({ userId: demo.id, email: demo.email });
      const seeded = await seedDemoData(async (method, path, body) => {
        const res = await server.inject({
          method: method as "GET" | "POST" | "PATCH" | "DELETE",
          url: `/api${path}`,
          headers: { authorization: `Bearer ${token}` },
          ...(body === undefined ? {} : { payload: body as object }),
        });
        // 409 = already exists (e.g. API key name) - same as the old seed script
        if (res.statusCode >= 400 && res.statusCode !== 409) {
          throw new Error(`${method} ${path} -> ${res.statusCode}: ${res.body}`);
        }
        return res.body ? res.json() : null;
      });
      server.log.info({ seeded }, "demo account re-seeded");
    }

    await refreshDemoTimestamps();
  } finally {
    running = false;
  }
}
