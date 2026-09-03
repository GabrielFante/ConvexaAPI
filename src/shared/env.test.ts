import { describe, it, expect } from "vitest";
import { envSchema } from "./env";

const validUrl = "postgresql://user:pass@localhost:5432/db";
const secret = "a".repeat(32);

const baseEnv = {
  DATABASE_URL: validUrl,
  JWT_SECRET: secret,
  INTERNAL_API_KEY: secret,
};

describe("envSchema", () => {
  it("aceita uma env válida", () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      PORT: "4000",
      NODE_ENV: "production",
      CORS_ORIGINS: "https://painel.convexa.app",
      RESEND_API_KEY: "re_chave_de_teste",
    });

    expect(result.success).toBe(true);
  });

  it("rejeita quando DATABASE_URL está ausente", () => {
    const result = envSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejeita quando DATABASE_URL não é uma URL", () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      DATABASE_URL: "nao-e-url",
    });

    expect(result.success).toBe(false);
  });

  it("aplica os defaults de PORT e NODE_ENV", () => {
    const result = envSchema.safeParse(baseEnv);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3000);
      expect(result.data.NODE_ENV).toBe("development");
    }
  });

  it("coage PORT de string para número", () => {
    const result = envSchema.safeParse({ ...baseEnv, PORT: "4000" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(4000);
    }
  });

  it("rejeita JWT_SECRET com menos de 32 caracteres", () => {
    const result = envSchema.safeParse({ ...baseEnv, JWT_SECRET: "curto" });

    expect(result.success).toBe(false);
  });

  it("rejeita INTERNAL_API_KEY com menos de 32 caracteres", () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      INTERNAL_API_KEY: "curto",
    });

    expect(result.success).toBe(false);
  });

  it("aplica os defaults dos tempos de vida dos tokens", () => {
    const result = envSchema.safeParse(baseEnv);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
      expect(result.data.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    }
  });

  it("quebra CORS_ORIGINS em lista, ignorando espaços e vazios", () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      CORS_ORIGINS: " http://a.com , http://b.com ,, ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.CORS_ORIGINS).toEqual([
        "http://a.com",
        "http://b.com",
      ]);
    }
  });

  it("exige CORS_ORIGINS em produção", () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      NODE_ENV: "production",
      RESEND_API_KEY: "re_chave_de_teste",
    });

    expect(result.success).toBe(false);
  });

  it("exige RESEND_API_KEY em produção", () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      NODE_ENV: "production",
      CORS_ORIGINS: "https://painel.convexa.app",
    });

    expect(result.success).toBe(false);
  });

  it("não exige RESEND_API_KEY fora de produção", () => {
    expect(envSchema.safeParse(baseEnv).success).toBe(true);
  });

  it("aplica os defaults de APP_URL e do prazo de redefinição", () => {
    const result = envSchema.safeParse(baseEnv);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.APP_URL).toBe("http://localhost:5173");
      expect(result.data.PASSWORD_RESET_TTL_MINUTES).toBe(30);
    }
  });

  it("rejeita APP_URL que não é URL", () => {
    const result = envSchema.safeParse({ ...baseEnv, APP_URL: "nao-e-url" });

    expect(result.success).toBe(false);
  });
});
