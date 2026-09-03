import { describe, it, expect } from "vitest";
import { env } from "../env";
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  passwordResetExpiresAt,
} from "./password-reset-token";

describe("password-reset-token", () => {
  it("gera tokens distintos a cada chamada", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generatePasswordResetToken()),
    );

    expect(tokens.size).toBe(50);
  });

  it("gera tokens seguros para viajar numa query string", () => {
    const token = generatePasswordResetToken();

    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(encodeURIComponent(token)).toBe(token);
  });

  it("hasheia de forma determinística e sem revelar o token", () => {
    const token = generatePasswordResetToken();

    expect(hashPasswordResetToken(token)).toBe(hashPasswordResetToken(token));
    expect(hashPasswordResetToken(token)).not.toBe(token);
  });

  it("calcula a expiração a partir de PASSWORD_RESET_TTL_MINUTES", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expected = now.getTime() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000;

    expect(passwordResetExpiresAt(now).getTime()).toBe(expected);
  });

  it("expira antes do refresh token", () => {
    expect(env.PASSWORD_RESET_TTL_MINUTES).toBeLessThan(
      env.REFRESH_TOKEN_TTL_DAYS * 24 * 60,
    );
  });
});
