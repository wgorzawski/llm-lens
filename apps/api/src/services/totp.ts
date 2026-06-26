import crypto from "node:crypto";
import { authenticator } from "otplib";
import { DEFAULT_RECOVERY_CODE_COUNT } from "../constants.js";

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpKeyUri(email: string, secret: string): string {
  return authenticator.keyuri(email, "LLM Lens", secret);
}

export function verifyTotpCode(code: string, secret: string): boolean {
  try {
    return authenticator.verify({ token: code, secret });
  } catch {
    return false;
  }
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function generateRecoveryCodes(count = DEFAULT_RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(5).toString("hex").match(/.{1,5}/g)!.join("-")
  );
}
