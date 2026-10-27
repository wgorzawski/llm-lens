import type { FastifyInstance, FastifyRequest } from "fastify";
import { createSession, findSession, touchSession } from "../db/sessions.repository";

// Sign-in tokens are tied to a row in `sessions`: they expire (JWT_TTL, default 30 days)
// and stop working as soon as that session is revoked (sign-out, "revoke" in settings,
// password change), instead of staying valid forever.

export const TOKEN_TTL = process.env["JWT_TTL"] || "30d";
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export function deviceFromUserAgent(ua: string): string {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown device";
}

/** Creates a session for the user and returns a token bound to it */
export async function issueSessionToken(
  request: FastifyRequest,
  user: { id: string; email: string }
): Promise<string> {
  const ua = request.headers["user-agent"] ?? "unknown";
  const session = await createSession(user.id, deviceFromUserAgent(ua), request.ip, ua);
  return request.server.jwt.sign({ userId: user.id, email: user.email, sid: session.id }, { expiresIn: TOKEN_TTL });
}

/** Short-lived token for the server's own requests (demo seeding via server.inject) */
export function issueServiceToken(server: FastifyInstance, user: { id: string; email: string }): string {
  return server.jwt.sign({ userId: user.id, email: user.email, svc: true }, { expiresIn: "15m" });
}

/**
 * Checks a verified JWT payload: half-finished 2FA logins are refused, and session tokens
 * must still have their session. Returns an error message, or null when the token is fine.
 */
export async function checkTokenPayload(payload: {
  userId: string;
  pending2fa?: boolean;
  sid?: string;
  svc?: boolean;
}): Promise<string | null> {
  if (payload.pending2fa) return "Two-factor authentication required";
  if (payload.svc) return null;
  if (!payload.sid) return "Session expired - please sign in again";
  const session = await findSession(payload.sid);
  if (!session || session.userId !== payload.userId) return "Session expired - please sign in again";
  if (Date.now() - session.lastActiveAt > TOUCH_EVERY_MS) {
    void touchSession(session.id).catch(() => { /* non-critical */ });
  }
  return null;
}
