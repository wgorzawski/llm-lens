import { Controller, GET, POST } from "fastify-decorators";
import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { createUser, findUserByEmail, findUserById, findOrCreateOAuthUser, consumeRecoveryCode } from "../db/users.repository.js";
import { BCRYPT_ROUNDS, PENDING_2FA_TOKEN_TTL, OAUTH_FETCH_TIMEOUT_MS } from "../constants.js";
import { createSession } from "../db/sessions.repository.js";
import { verifyTotpCode, hashRecoveryCode } from "../services/totp.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: { userId: string; email: string; pending2fa?: boolean };
  }
}

function deviceFromUserAgent(ua: string): string {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown device";
}

const AUTH_RATE_LIMIT = {
  max: parseInt(process.env["AUTH_RATE_LIMIT_MAX"] ?? "10", 10),
  timeWindow: "1 minute",
};

@Controller("/auth")
export class AuthController {
  @POST("/register", { config: { rateLimit: AUTH_RATE_LIMIT } })
  async register(
    request: FastifyRequest<{ Body: { email: string; password: string } }>,
    reply: FastifyReply
  ) {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.status(400).send({ error: "Email and password are required" });
    }
    if (password.length < 8) {
      return reply.status(400).send({ error: "Password must be at least 8 characters" });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return reply.status(409).send({ error: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await createUser(email, passwordHash);

    const token = request.server.jwt.sign({ userId: user.id, email: user.email });
    const ua = request.headers["user-agent"] ?? "unknown";
    void createSession(user.id, deviceFromUserAgent(ua), request.ip, ua)
      .catch((err: unknown) => request.server.log.warn({ err }, "Failed to create session"));
    return reply.status(201).send({ token, user });
  }

  @POST("/login", { config: { rateLimit: AUTH_RATE_LIMIT } })
  async login(
    request: FastifyRequest<{ Body: { email: string; password: string } }>,
    reply: FastifyReply
  ) {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.status(400).send({ error: "Email and password are required" });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    if (user.totpEnabled) {
      const pendingToken = request.server.jwt.sign(
        { userId: user.id, email: user.email, pending2fa: true },
        { expiresIn: PENDING_2FA_TOKEN_TTL }
      );
      return { requiresTwoFactor: true, pendingToken };
    }

    const token = request.server.jwt.sign({ userId: user.id, email: user.email });
    const ua = request.headers["user-agent"] ?? "unknown";
    void createSession(user.id, deviceFromUserAgent(ua), request.ip, ua)
      .catch((err: unknown) => request.server.log.warn({ err }, "Failed to create session"));
    return { token, user: { id: user.id, email: user.email } };
  }

  @POST("/login/2fa")
  async loginTwoFactor(
    request: FastifyRequest<{ Body: { pendingToken: string; code: string } }>,
    reply: FastifyReply
  ) {
    const { pendingToken, code } = request.body;
    if (!pendingToken || !code) {
      return reply.status(400).send({ error: "pendingToken and code are required" });
    }

    let payload: { userId: string; email: string; pending2fa?: boolean };
    try {
      payload = request.server.jwt.verify(pendingToken);
    } catch {
      return reply.status(401).send({ error: "Invalid or expired pending token" });
    }
    if (!payload.pending2fa) {
      return reply.status(401).send({ error: "Invalid pending token" });
    }

    const user = await findUserById(payload.userId);
    if (!user || !user.totpEnabled || !user.totpSecret) {
      return reply.status(401).send({ error: "Two-factor authentication is not enabled" });
    }

    const valid = verifyTotpCode(code, user.totpSecret) || (await consumeRecoveryCode(user.id, hashRecoveryCode(code)));
    if (!valid) {
      return reply.status(401).send({ error: "Invalid code" });
    }

    const token = request.server.jwt.sign({ userId: user.id, email: user.email });
    const ua = request.headers["user-agent"] ?? "unknown";
    void createSession(user.id, deviceFromUserAgent(ua), request.ip, ua)
      .catch((err: unknown) => request.server.log.warn({ err }, "Failed to create session"));
    return { token, user: { id: user.id, email: user.email } };
  }

  // ── OAuth callbacks ─────────────────────────────────────────────────────────
  // These live here rather than in index.ts because they contain auth business
  // logic (user creation, JWT signing) — not just routing configuration.

  @GET("/google/callback")
  async googleCallback(request: FastifyRequest, reply: FastifyReply) {
    const frontendUrl = process.env["FRONTEND_URL"] ?? "http://localhost:3000";
    const tokenSet = await request.server.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request, reply);

    const profile = await fetchWithTimeout<{ id: string; email: string }>(
      "https://www.googleapis.com/userinfo/v2/me",
      { headers: { Authorization: `Bearer ${tokenSet.token.access_token}` } },
    );
    if (!profile?.email) return reply.redirect(`${frontendUrl}/login?error=no_email`);

    const user = await findOrCreateOAuthUser(profile.email, "google", profile.id);
    const token = request.server.jwt.sign({ userId: user.id, email: user.email });
    return reply.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }

  @GET("/github/callback")
  async githubCallback(request: FastifyRequest, reply: FastifyReply) {
    const frontendUrl = process.env["FRONTEND_URL"] ?? "http://localhost:3000";
    const tokenSet = await request.server.githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(request, reply);

    const ghHeaders = {
      Authorization: `Bearer ${tokenSet.token.access_token}`,
      Accept: "application/json",
      "User-Agent": "llm-lens",
    };

    const profile = await fetchWithTimeout<{ id: number; email: string | null }>(
      "https://api.github.com/user",
      { headers: ghHeaders },
    );

    let email = profile?.email ?? null;
    if (!email) {
      const emails = await fetchWithTimeout<Array<{ email: string; primary: boolean; verified: boolean }>>(
        "https://api.github.com/user/emails",
        { headers: ghHeaders },
      );
      email = emails?.find((e) => e.primary && e.verified)?.email ?? null;
    }

    if (!email) return reply.redirect(`${frontendUrl}/login?error=no_email`);

    const user = await findOrCreateOAuthUser(email, "github", String(profile?.id));
    const token = request.server.jwt.sign({ userId: user.id, email: user.email });
    return reply.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }
}

// Fetch with a hard timeout so OAuth provider slowness doesn't hang the server.
async function fetchWithTimeout<T>(url: string, init?: RequestInit): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OAUTH_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
