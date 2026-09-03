import { createHash, randomBytes } from "node:crypto";
import { env } from "../env";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiresAt(now = new Date()): Date {
  return new Date(
    now.getTime() + env.REFRESH_TOKEN_TTL_DAYS * MILLISECONDS_PER_DAY,
  );
}
