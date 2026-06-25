import { Controller, GET, PATCH, POST } from "fastify-decorators";
import { BCRYPT_ROUNDS } from "../constants.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import {
  findUserById,
  findUserByHandle,
  updateProfile,
  updatePasswordHash,
  updatePreferences,
  setPendingTotpSecret,
  enableTotp,
  disableTotp,
  consumeRecoveryCode,
  type ProfileUpdate,
} from "../db/users.repository.js";
import {
  generateTotpSecret,
  totpKeyUri,
  verifyTotpCode,
  hashRecoveryCode,
  generateRecoveryCodes,
} from "../services/totp.js";

type UserRow = NonNullable<Awaited<ReturnType<typeof findUserById>>>;

async function verifyTotpOrRecovery(user: UserRow, code: string): Promise<boolean> {
  if (!user.totpSecret) return false;
  if (verifyTotpCode(code, user.totpSecret)) return true;
  return consumeRecoveryCode(user.id, hashRecoveryCode(code));
}

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
