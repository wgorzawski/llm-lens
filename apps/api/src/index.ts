import "reflect-metadata";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import oauth2Plugin, { type OAuth2Namespace } from "@fastify/oauth2";
import { bootstrap } from "fastify-decorators";
import { initDb } from "./db/index.js";
import { TracesController } from "./controllers/traces.controller.js";
import { AuthController } from "./controllers/auth.controller.js";
import { ApiKeysController } from "./controllers/api-keys.controller.js";
import { UsersController } from "./controllers/users.controller.js";
import { SessionsController } from "./controllers/sessions.controller.js";
import { OrgsController } from "./controllers/orgs.controller.js";
import { ExportController } from "./controllers/export.controller.js";
import { findUserById } from "./db/users.repository.js";
import { hashKey, findApiKeyByHash, touchApiKey } from "./db/api-keys.repository.js";
import { enforceRetention } from "./services/retention.js";
import { RETENTION_CHECK_INTERVAL_MS } from "./constants.js";

declare module "fastify" {
  interface FastifyInstance {
    googleOAuth2: OAuth2Namespace;
    githubOAuth2: OAuth2Namespace;
  }
}

const server = Fastify({ logger: true });

const apiUrl = process.env["API_URL"] ?? "http://localhost:3001";

await server.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"] });
await server.register(rateLimit, { global: false });
const jwtSecret = process.env["JWT_SECRET"];
if (!jwtSecret) throw new Error("JWT_SECRET environment variable is required");

await server.register(jwt, { secret: jwtSecret });

await server.register(oauth2Plugin, {
  name: "googleOAuth2",
  credentials: {
    client: {
      id: process.env["GOOGLE_CLIENT_ID"] ?? "",
      secret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
    },
    auth: {
      authorizeHost: "https://accounts.google.com",
      authorizePath: "/o/oauth2/v2/auth",
      tokenHost: "https://www.googleapis.com",
      tokenPath: "/oauth2/v4/token",
    },
  },
  startRedirectPath: "/api/auth/google",
  callbackUri: `${apiUrl}/api/auth/google/callback`,
  scope: ["profile", "email"],
});

await server.register(oauth2Plugin, {
  name: "githubOAuth2",
  credentials: {
    client: {
      id: process.env["GITHUB_CLIENT_ID"] ?? "",
      secret: process.env["GITHUB_CLIENT_SECRET"] ?? "",
    },
    auth: {
      tokenHost: "https://github.com",
      tokenPath: "/login/oauth/access_token",
      authorizePath: "/login/oauth/authorize",
    },
  },
  startRedirectPath: "/api/auth/github",
  callbackUri: `${apiUrl}/api/auth/github/callback`,
  scope: ["user:email"],
});

server.addHook("preHandler", async (request, reply) => {
  if (request.url.startsWith("/api/auth") || request.url === "/health") return;
  if (request.method === "GET" && /^\/api\/orgs\/invites\/[^/]+$/.test(request.url)) return;

  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer llmlens_sk_")) {
    const rawKey = authHeader.slice("Bearer ".length);
    const key = await findApiKeyByHash(hashKey(rawKey));
    if (!key) return reply.status(401).send({ error: "Invalid API key" });
    const user = await findUserById(key.userId);
    if (!user) return reply.status(401).send({ error: "Invalid API key" });
    request.user = { userId: user.id, email: user.email };
    void touchApiKey(key.id).catch(() => { /* non-critical */ });
    return;
  }

  await request.jwtVerify();
});

await server.register(bootstrap, {
  prefix: "/api",
  controllers: [
    TracesController,
    AuthController,
    ApiKeysController,
    UsersController,
    SessionsController,
    OrgsController,
    ExportController,
  ],
});

// Normalize all unhandled errors to { error: string } so clients always get
// a consistent shape regardless of which plugin or hook threw.
server.setErrorHandler((err: { statusCode?: number; message: string }, _request, reply) => {
  const status = err.statusCode ?? 500;
  const message = status < 500 ? err.message : "Internal server error";
  if (status >= 500) server.log.error(err);
  return reply.status(status).send({ error: message });
});

server.get("/health", async () => ({ status: "ok" }));

await initDb();

void enforceRetention().catch((err) => server.log.error(err));
setInterval(() => {
  void enforceRetention().catch((err) => server.log.error(err));
}, RETENTION_CHECK_INTERVAL_MS);

try {
  await server.listen({ port: parseInt(process.env["PORT"] ?? "3001"), host: "0.0.0.0" });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
