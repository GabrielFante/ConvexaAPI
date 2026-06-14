import { describe, it, expect } from "vitest";
import { envSchema } from "./env";

const validUrl = "postgresql://user:pass@localhost:5432/db";

describe("envSchema", () => {
  it("aceita uma env válida", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: validUrl,
      PORT: "4000",
      NODE_ENV: "production",
    });

    expect(result.success).toBe(true);
  });

  it("rejeita quando DATABASE_URL está ausente", () => {
    const result = envSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejeita quando DATABASE_URL não é uma URL", () => {
    const result = envSchema.safeParse({ DATABASE_URL: "nao-e-url" });

    expect(result.success).toBe(false);
  });

  it("aplica os defaults de PORT e NODE_ENV", () => {
    const result = envSchema.safeParse({ DATABASE_URL: validUrl });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3000);
      expect(result.data.NODE_ENV).toBe("development");
    }
  });

  it("coage PORT de string para número", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: validUrl,
      PORT: "4000",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(4000);
    }
  });
});
