import "reflect-metadata";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { bootstrap } from "fastify-decorators";
import { initDb } from "./db/index.js";
import { TracesController } from "./controllers/traces.controller.js";

const server = Fastify({ logger: true });

await server.register(cors, { origin: true });

await server.register(bootstrap, {
  prefix: "/api",
  controllers: [TracesController],
});

server.get("/health", async () => ({ status: "ok" }));

await initDb();

try {
  await server.listen({ port: 3001, host: "0.0.0.0" });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
