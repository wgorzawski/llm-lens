import "reflect-metadata";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import oauth2Plugin, { type OAuth2Namespace } from "@fastify/oauth2";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { bootstrap } from "fastify-decorators";
import { initDb, db, users, client } from "./db/index";
import { initAlertState, checkUserAlerts, checkUserDigests, ALERT_CHECK_INTERVAL_MS } from "./services/alerts";
import { TracesController } from "./controllers/traces.controller";
import { AuthController } from "./controllers/auth.controller";
import { ApiKeysController } from "./controllers/api-keys.controller";
import { UsersController } from "./controllers/users.controller";
import { SessionsController } from "./controllers/sessions.controller";
import { OrgsController } from "./controllers/orgs.controller";
import { ExportController } from "./controllers/export.controller";
import { AnalyticsController } from "./controllers/analytics.controller";
import { findUserById } from "./db/users.repository";
import { hashKey, findApiKeyByHash, touchApiKey } from "./db/api-keys.repository";
import { enforceRetention } from "./services/retention";
import { runDemoMaintenance } from "./services/demo-maintenance";
import { isBlockedForDemoAccount } from "./services/demo-guard";
import { bodyLimitBytes, loadPricingOverrides } from "./services/instance";
import { runBackupIfDue, backupsEnabled } from "./services/backup";
import { apiKeyRouteAllowed } from "./services/api-key-scopes";
import { checkTokenPayload } from "./services/auth-tokens";
import { checkRole } from "./services/roles";
import { RETENTION_CHECK_INTERVAL_MS, DEMO_REFRESH_INTERVAL_MS, DEMO_MIN_RETENTION_DAYS, BACKUP_CHECK_INTERVAL_MS } from "./constants";

declare module "fastify" {
  interface FastifyInstance {
    googleOAuth2: OAuth2Namespace;
    githubOAuth2: OAuth2Namespace;
  }
}

function parseScopes(raw: string): string[] {
  try {
    const scopes: unknown = JSON.parse(raw);
    return Array.isArray(scopes) ? scopes.map(String) : [];
  } catch {
    return [];
  }
}

const server = Fastify({ logger: true, bodyLimit: bodyLimitBytes });

const apiUrl = process.env["API_URL"] ?? "http://localhost:3001";

// CORS_ORIGINS (comma-separated) limits which sites may call the API from a browser -
// set it to the web app's URL in production. SDKs sending traces from servers aren't affected.
const corsOrigins = (process.env["CORS_ORIGINS"] ?? "").split(",").map((o) => o.trim()).filter(Boolean);
await server.register(cors, {
  origin: corsOrigins.length ? corsOrigins : true,
  methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"],
});
await server.register(rateLimit, { global: false });
await server.register(multipart, { limits: { fileSize: 2 * 1024 * 1024 } });
const uploadsDir = path.resolve(process.env["UPLOADS_DIR"] ?? "./uploads");
mkdirSync(uploadsDir, { recursive: true });
await server.register(staticPlugin, { root: uploadsDir, prefix: "/uploads/" });
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
  if (request.method === "POST" && request.url === "/api/analytics/ping") return;

  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer llmlens_sk_")) {
    const rawKey = authHeader.slice("Bearer ".length);
    const key = await findApiKeyByHash(hashKey(rawKey));
    if (!key || key.status !== "active") return reply.status(401).send({ error: "Invalid API key" });
    const user = await findUserById(key.userId);
    if (!user) return reply.status(401).send({ error: "Invalid API key" });
    // API keys are for sending and reading traces - never for account, org or key management
    const scopeError = apiKeyRouteAllowed(request.method, request.routeOptions.url, parseScopes(key.scopes));
    if (scopeError) return reply.status(403).send({ error: scopeError });
    request.user = { userId: user.id, email: user.email, apiKeyEnv: key.env };
    void touchApiKey(key.id).catch(() => { /* non-critical */ });
    return;
  }

  await request.jwtVerify();
  const tokenError = await checkTokenPayload(request.user);
  if (tokenError) return reply.status(401).send({ error: tokenError });
});

// Organization roles (viewer / member / admin / owner) - see services/roles.ts
server.addHook("preHandler", async (request, reply) => {
  if (!request.user?.userId) return;
  const roleError = await checkRole(request.user.userId, request.method, request.routeOptions.url);
  if (roleError) return reply.status(403).send({ error: roleError });
});

// In demo mode traces are kept "fresh" (shifted forward hourly), retention gets a
// floor and the shared demo account can't run destructive actions, so the public
// demo never ends up as an empty dashboard.
const demoMode = process.env["DEMO_MODE"] === "true";

if (demoMode) {
  server.addHook("preHandler", async (request, reply) => {
    if (isBlockedForDemoAccount(request.method, request.routeOptions.url, request.user?.email)) {
      return reply.status(403).send({ error: "This action is disabled on the shared demo account" });
    }
  });
}

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
    AnalyticsController,
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

server.get("/health", async (_request, reply) => {
  try {
    await client.execute("SELECT 1");
    return { status: "ok" };
  } catch {
    return reply.status(503).send({ status: "error", error: "database unavailable" });
  }
});

// Finish in-flight requests before exiting on deploys / restarts (PM2, Docker send SIGTERM/SIGINT)
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.log.info({ signal }, "shutting down");
    const force = setTimeout(() => process.exit(0), 10_000);
    force.unref();
    void server.close().then(() => process.exit(0));
  });
}

await initDb();
await initAlertState();
loadPricingOverrides(server.log);

try {
  await server.listen({ port: parseInt(process.env["PORT"] ?? "3001"), host: "::" });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}

// In demo mode this also repairs and, if needed, re-seeds the demo account (it seeds
// through the API's own routes, hence after listen).
async function runMaintenance(): Promise<void> {
  if (demoMode) await runDemoMaintenance(server);
  await enforceRetention(demoMode ? DEMO_MIN_RETENTION_DAYS : 0);
}

void runMaintenance().catch((err) => server.log.error(err));
setInterval(() => {
  void runMaintenance().catch((err) => server.log.error(err));
}, demoMode ? DEMO_REFRESH_INTERVAL_MS : RETENTION_CHECK_INTERVAL_MS);

// Threshold alerts and digests (Settings -> Notifications); off on the public demo.
if (!demoMode) {
  const checkAlerts = async () => {
    const all = await db.select({ id: users.id, email: users.email, preferences: users.preferences, timezone: users.timezone }).from(users);
    for (const user of all) {
      await checkUserAlerts(user).catch((err) => server.log.error({ err, userId: user.id }, "alert check failed"));
      await checkUserDigests(user).catch((err) => server.log.error({ err, userId: user.id }, "digest failed"));
    }
  };
  setInterval(() => void checkAlerts().catch((err) => server.log.error({ err }, "alert loop failed")), ALERT_CHECK_INTERVAL_MS);
}

// Daily database snapshot (only when BACKUP_DIR is set) - checked hourly, made once a day.
if (backupsEnabled) {
  const backup = () =>
    runBackupIfDue()
      .then((file) => file && server.log.info({ file }, "database backup written"))
      .catch((err) => server.log.error({ err }, "database backup failed"));
  void backup();
  setInterval(() => void backup(), BACKUP_CHECK_INTERVAL_MS);
}
