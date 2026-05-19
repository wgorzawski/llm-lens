import "reflect-metadata";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { bootstrap } from "fastify-decorators";
import { initDb } from "./db/index.js";
import { TracesController } from "./controllers/traces.controller.js";
import { AuthController } from "./controllers/auth.controller.js";

const server = Fastify({ logger: true });

await server.register(cors, { origin: true });
await server.register(jwt, {
  secret: process.env["JWT_SECRET"] ?? "dev-secret-change-in-prod",
});

server.addHook("preHandler", async (request) => {
  if (request.url.startsWith("/api/auth") || request.url === "/health") return;
  await request.jwtVerify();
});

await server.register(bootstrap, {
  prefix: "/api",
  controllers: [TracesController, AuthController],
});

server.get("/health", async () => ({ status: "ok" }));

await initDb();

try {
  await server.listen({ port: 3001, host: "0.0.0.0" });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
