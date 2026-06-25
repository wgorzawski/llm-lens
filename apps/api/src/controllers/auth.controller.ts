import { Controller, POST } from "fastify-decorators";
import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { createUser, findUserByEmail, findUserById, consumeRecoveryCode } from "../db/users.repository.js";
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

@Controller("/auth")
export class AuthController {
  @POST("/register")
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

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser(email, passwordHash);

    const token = request.server.jwt.sign({ userId: user.id, email: user.email });
    const ua = request.headers["user-agent"] ?? "unknown";
    void createSession(user.id, deviceFromUserAgent(ua), request.ip, ua);
    return reply.status(201).send({ token, user });
  }

  @POST("/login")
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
        { expiresIn: "5m" }
      );
      return { requiresTwoFactor: true, pendingToken };
    }

    const token = request.server.jwt.sign({ userId: user.id, email: user.email });
    const ua = request.headers["user-agent"] ?? "unknown";
    void createSession(user.id, deviceFromUserAgent(ua), request.ip, ua);
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
    void createSession(user.id, deviceFromUserAgent(ua), request.ip, ua);
    return { token, user: { id: user.id, email: user.email } };
  }
}
