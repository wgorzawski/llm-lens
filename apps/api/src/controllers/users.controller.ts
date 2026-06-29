import { Controller, GET, PATCH, POST, DELETE } from "fastify-decorators";
import { BCRYPT_ROUNDS } from "../constants";
import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { createWriteStream, mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  findUserById,
  findUserByEmail,
  findUserByHandle,
  updateProfile,
  updatePasswordHash,
  updateEmail,
  updateAvatarUrl,
  updatePreferences,
  setPendingTotpSecret,
  enableTotp,
  disableTotp,
  consumeRecoveryCode,
  type ProfileUpdate,
} from "../db/users.repository";
import {
  generateTotpSecret,
  totpKeyUri,
  verifyTotpCode,
  hashRecoveryCode,
  generateRecoveryCodes,
} from "../services/totp";

type UserRow = NonNullable<Awaited<ReturnType<typeof findUserById>>>;

async function verifyTotpOrRecovery(user: UserRow, code: string): Promise<boolean> {
  if (!user.totpSecret) return false;
  if (verifyTotpCode(code, user.totpSecret)) return true;
  return consumeRecoveryCode(user.id, hashRecoveryCode(code));
}

const UPLOADS_DIR = path.resolve(process.env["UPLOADS_DIR"] ?? "./uploads");
const AVATARS_DIR = path.join(UPLOADS_DIR, "avatars");
mkdirSync(AVATARS_DIR, { recursive: true });

function toMe(user: UserRow) {
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
    avatarUrl: user.avatarUrl ?? null,
  };
}

@Controller("/users")
export class UsersController {
  @GET("/me")
  async getMe(request: FastifyRequest, reply: FastifyReply) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    return toMe(user);
  }

  @PATCH("/me")
  async updateMe(
    request: FastifyRequest<{ Body: ProfileUpdate }>,
    reply: FastifyReply
  ) {
    const { displayName, handle, timezone, locale, dateFormat } = request.body;

    if (handle != null && handle.trim()) {
      const existing = await findUserByHandle(handle.trim(), request.user.userId);
      if (existing) return reply.status(409).send({ error: "Handle is already taken" });
    }

    const update: ProfileUpdate = {};
    if (displayName !== undefined) update.displayName = displayName;
    if (handle !== undefined) update.handle = handle != null ? handle.trim() || null : null;
    if (timezone !== undefined) update.timezone = timezone;
    if (locale !== undefined) update.locale = locale;
    if (dateFormat !== undefined) update.dateFormat = dateFormat;

    const user = await updateProfile(request.user.userId, update);
    if (!user) return reply.status(404).send({ error: "User not found" });
    return toMe(user);
  }

  @PATCH("/me/password")
  async updatePassword(
    request: FastifyRequest<{ Body: { currentPassword: string; newPassword: string } }>,
    reply: FastifyReply
  ) {
    const { currentPassword, newPassword } = request.body;
    if (!currentPassword || !newPassword) {
      return reply.status(400).send({ error: "currentPassword and newPassword are required" });
    }
    if (newPassword.length < 8) {
      return reply.status(400).send({ error: "New password must be at least 8 characters" });
    }

    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return reply.status(400).send({ error: "Current password is incorrect" });

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await updatePasswordHash(user.id, newHash);
    return reply.status(204).send();
  }

  @PATCH("/me/preferences")
  async updateMyPreferences(
    request: FastifyRequest<{ Body: Record<string, unknown> }>,
    reply: FastifyReply
  ) {
    const preferences = await updatePreferences(request.user.userId, request.body ?? {});
    if (!preferences) return reply.status(404).send({ error: "User not found" });
    return { preferences };
  }

  @PATCH("/me/email")
  async changeEmail(
    request: FastifyRequest<{ Body: { email: string; password: string } }>,
    reply: FastifyReply
  ) {
    const { email, password } = request.body;
    if (!email || !password) return reply.status(400).send({ error: "email and password are required" });

    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return reply.status(400).send({ error: "Password is incorrect" });

    const existing = await findUserByEmail(email.trim().toLowerCase());
    if (existing && existing.id !== user.id) return reply.status(409).send({ error: "Email is already in use" });

    const updated = await updateEmail(user.id, email.trim().toLowerCase());
    if (!updated) return reply.status(404).send({ error: "User not found" });
    return toMe(updated);
  }

  @POST("/me/avatar")
  async uploadAvatar(request: FastifyRequest, reply: FastifyReply) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });

    const data = await request.file();
    if (!data) return reply.status(400).send({ error: "No file provided" });

    const ext = path.extname(data.filename).toLowerCase() || ".jpg";
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    if (!allowed.includes(ext)) return reply.status(400).send({ error: "File type not allowed" });

    const filename = `${user.id}${ext}`;
    const dest = path.join(AVATARS_DIR, filename);
    await pipeline(data.file, createWriteStream(dest));

    const avatarUrl = `/uploads/avatars/${filename}`;
    await updateAvatarUrl(user.id, avatarUrl);
    return { avatarUrl };
  }

  @DELETE("/me/avatar")
  async deleteAvatar(request: FastifyRequest, reply: FastifyReply) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    if (user.avatarUrl) {
      const filePath = path.join(UPLOADS_DIR, user.avatarUrl.replace("/uploads/", ""));
      await unlink(filePath).catch(() => null);
    }
    await updateAvatarUrl(user.id, null);
    return reply.status(204).send();
  }

  @POST("/me/2fa/setup")
  async setupTotp(request: FastifyRequest, reply: FastifyReply) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    if (user.totpEnabled) return reply.status(400).send({ error: "Two-factor authentication is already enabled" });

    const secret = generateTotpSecret();
    await setPendingTotpSecret(user.id, secret);
    const uri = totpKeyUri(user.email, secret);
    const qrCode = await QRCode.toDataURL(uri);
    return { secret, uri, qrCode };
  }

  @POST("/me/2fa/verify")
  async verifyTotp(
    request: FastifyRequest<{ Body: { code: string } }>,
    reply: FastifyReply
  ) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    if (!user.totpSecret) return reply.status(400).send({ error: "Start setup first" });

    if (!verifyTotpCode(request.body.code ?? "", user.totpSecret)) {
      return reply.status(400).send({ error: "Invalid code" });
    }

    const recoveryCodes = generateRecoveryCodes();
    await enableTotp(user.id, recoveryCodes.map(hashRecoveryCode));
    return { recoveryCodes };
  }

  @POST("/me/2fa/disable")
  async disable(
    request: FastifyRequest<{ Body: { code: string } }>,
    reply: FastifyReply
  ) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    if (!user.totpEnabled) return reply.status(400).send({ error: "Two-factor authentication is not enabled" });

    if (!(await verifyTotpOrRecovery(user, request.body.code ?? ""))) {
      return reply.status(400).send({ error: "Invalid code" });
    }
    await disableTotp(user.id);
    return reply.status(204).send();
  }

  @POST("/me/2fa/recovery-codes/regenerate")
  async regenerateRecoveryCodes(
    request: FastifyRequest<{ Body: { code: string } }>,
    reply: FastifyReply
  ) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    if (!user.totpEnabled || !user.totpSecret) {
      return reply.status(400).send({ error: "Two-factor authentication is not enabled" });
    }
    if (!verifyTotpCode(request.body.code ?? "", user.totpSecret)) {
      return reply.status(400).send({ error: "Invalid code" });
    }

    const recoveryCodes = generateRecoveryCodes();
    await enableTotp(user.id, recoveryCodes.map(hashRecoveryCode));
    return { recoveryCodes };
  }
}
