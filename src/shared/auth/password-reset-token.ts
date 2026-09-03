import { createHash, randomBytes } from "node:crypto";
import { env } from "../env";

const MILLISECONDS_PER_MINUTE = 60 * 1000;

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function passwordResetExpiresAt(now = new Date()): Date {
  return new Date(
    now.getTime() + env.PASSWORD_RESET_TTL_MINUTES * MILLISECONDS_PER_MINUTE,
  );
}
