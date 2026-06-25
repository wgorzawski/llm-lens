import "reflect-metadata";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
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
import { findOrCreateOAuthUser, findUserById } from "./db/users.repository.js";
import { hashKey, findApiKeyByHash, touchApiKey } from "./db/api-keys.repository.js";
import { enforceRetention } from "./services/retention.js";

declare module "fastify" {
  interface FastifyInstance {
    googleOAuth2: OAuth2Namespace;
    githubOAuth2: OAuth2Namespace;
  }
}

const server = Fastify({ logger: true });

const apiUrl = process.env["API_URL"] ?? "http://localhost:3001";
const frontendUrl = process.env["FRONTEND_URL"] ?? "http://localhost:3000";

await server.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"] });
await server.register(jwt, {
  secret: process.env["JWT_SECRET"] ?? "dev-secret-change-in-prod",
});

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
    const token = authHeader.slice("Bearer ".length);
    const key = await findApiKeyByHash(hashKey(token));
    if (!key) return reply.status(401).send({ error: "Invalid API key" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request as any).user = { userId: key.userId, email: "" };
    void touchApiKey(key.id);
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

server.get("/health", async () => ({ status: "ok" }));

server.get("/api/me", async (request, reply) => {
  const user = await findUserById(request.user.userId);
  if (!user) return reply.status(404).send({ error: "User not found" });
  return {
    id: user.id,
    email: user.email,
    org: user.org,
    plan: user.plan,
    displayName: user.displayName,
    handle: user.handle,
    timezone: user.timezone,
    locale: user.locale,
    dateFormat: user.dateFormat,
    preferences: JSON.parse(user.preferences),
    totpEnabled: user.totpEnabled,
  };
});


server.get("/api/auth/google/callback", async (request, reply) => {
  const tokenSet = await server.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request, reply);
  const profile = await fetch("https://www.googleapis.com/userinfo/v2/me", {
    headers: { Authorization: `Bearer ${tokenSet.token.access_token}` },
  }).then((r) => r.json() as Promise<{ id: string; email: string }>);

  const user = await findOrCreateOAuthUser(profile.email, "google", profile.id);
  const token = server.jwt.sign({ userId: user.id, email: user.email });
  return reply.redirect(`${frontendUrl}/auth/callback?token=${token}`);
});

server.get("/api/auth/github/callback", async (request, reply) => {
  const tokenSet = await server.githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(request, reply);

  const ghHeaders = {
    Authorization: `Bearer ${tokenSet.token.access_token}`,
    Accept: "application/json",
    "User-Agent": "llm-lens",
  };

  const profile = await fetch("https://api.github.com/user", { headers: ghHeaders })
    .then((r) => r.json() as Promise<{ id: number; email: string | null }>);

  let email = profile.email;
  if (!email) {
    const emails = await fetch("https://api.github.com/user/emails", { headers: ghHeaders })
      .then((r) => r.json() as Promise<Array<{ email: string; primary: boolean; verified: boolean }>>);
    email = emails.find((e) => e.primary && e.verified)?.email ?? null;
  }

  if (!email) {
    return reply.redirect(`${frontendUrl}/login?error=no_email`);
  }

  const user = await findOrCreateOAuthUser(email, "github", String(profile.id));
  const token = server.jwt.sign({ userId: user.id, email: user.email });
  return reply.redirect(`${frontendUrl}/auth/callback?token=${token}`);
});

await initDb();

server.get("/api/debug/retention-check", async () => {
  const { listAllOrgs } = await import("./db/orgs.repository.js");
  const { db, users, traces } = await import("./db/index.js");
  const orgs = await listAllOrgs();
  const allUsers = await db.select().from(users);
  const allTraces = await db.select().from(traces);
  return { cwd: process.cwd(), dbUrl: process.env["DATABASE_URL"], orgs, userCount: allUsers.length, traces: allTraces };
});

void enforceRetention().catch((err) => server.log.error(err));
setInterval(() => {
  void enforceRetention().catch((err) => server.log.error(err));
}, 24 * 60 * 60 * 1000);

try {
  await server.listen({ port: 3001, host: "0.0.0.0" });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
