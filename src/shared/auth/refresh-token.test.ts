import { describe, it, expect } from "vitest";
import { env } from "../env";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiresAt,
} from "./refresh-token";

describe("refresh-token", () => {
  it("gera tokens distintos a cada chamada", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generateRefreshToken()),
    );

    expect(tokens.size).toBe(50);
  });

  it("gera tokens longos o bastante para não serem adivinhados", () => {
    expect(generateRefreshToken().length).toBeGreaterThanOrEqual(64);
  });

  it("hasheia de forma determinística e sem revelar o token", () => {
    const token = generateRefreshToken();

    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(token);
  });

  it("calcula a expiração a partir de REFRESH_TOKEN_TTL_DAYS", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expected =
      now.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

    expect(refreshTokenExpiresAt(now).getTime()).toBe(expected);
  });
});
