import { describe, it, expect } from "vitest";
import { envSchema } from "./env";

const validUrl = "postgresql://user:pass@localhost:5432/db";
const secret = "a".repeat(32);

const baseEnv = {
  DATABASE_URL: validUrl,
  JWT_SECRET: secret,
  INTERNAL_API_KEY: secret,
  MAIL_DRIVER: "console",
};

const strongJwtSecret = "i5k1hcztbPZ4f8EnlXi2XqncYWETYQFLDG1RkF3GR-E";
const strongInternalKey = "kGpnZ050tPmJVFImvmeCUqkyWFU_KXsRMTGBT33svJE";
const exampleSecret =
  "troque-por-uma-string-aleatoria-de-no-minimo-32-caracteres";

const prodEnv = {
  DATABASE_URL: validUrl,
  NODE_ENV: "production",
  CORS_ORIGINS: "https://painel.convexa.app",
  RESEND_API_KEY: "re_chave_de_teste",
  JWT_SECRET: strongJwtSecret,
  INTERNAL_API_KEY: strongInternalKey,
};

function issuesFor(input: Record<string, string>) {
  const result = envSchema.safeParse(input);
  return result.success ? [] : result.error.issues;
}

function issuePaths(input: Record<string, string>): string[] {
  return issuesFor(input).map((issue) => issue.path.join("."));
}

describe("envSchema", () => {
  it("aceita uma env válida", () => {
    const result = envSchema.safeParse({ ...prodEnv, PORT: "4000" });

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
    const { CORS_ORIGINS: _cors, ...withoutCors } = prodEnv;

    expect(issuePaths(withoutCors)).toEqual(["CORS_ORIGINS"]);
  });

  it("exige RESEND_API_KEY em produção", () => {
    const { RESEND_API_KEY: _resend, ...withoutResend } = prodEnv;

    expect(issuePaths(withoutResend)).toEqual(["RESEND_API_KEY"]);
  });

  describe("segredos em produção", () => {
    it("rejeita o placeholder do .env.example no JWT_SECRET", () => {
      expect(issuePaths({ ...prodEnv, JWT_SECRET: exampleSecret })).toEqual([
        "JWT_SECRET",
      ]);
    });

    it("rejeita o placeholder do .env.example na INTERNAL_API_KEY", () => {
      expect(
        issuePaths({ ...prodEnv, INTERNAL_API_KEY: exampleSecret }),
      ).toEqual(["INTERNAL_API_KEY"]);
    });

    it("rejeita segredo com palavra de exemplo mesmo em maiúsculas", () => {
      expect(
        issuePaths({
          ...prodEnv,
          JWT_SECRET: "X7qLmP2vKz9RtW4nYb8CjH5dFg3S_SECRET_kQ",
        }),
      ).toEqual(["JWT_SECRET"]);
    });

    it("rejeita segredo com pouca variedade de caracteres", () => {
      expect(issuePaths({ ...prodEnv, JWT_SECRET: "a".repeat(32) })).toEqual([
        "JWT_SECRET",
      ]);
      expect(
        issuePaths({ ...prodEnv, INTERNAL_API_KEY: "ab".repeat(20) }),
      ).toEqual(["INTERNAL_API_KEY"]);
    });

    it("rejeita JWT_SECRET igual à INTERNAL_API_KEY", () => {
      expect(
        issuePaths({ ...prodEnv, INTERNAL_API_KEY: strongJwtSecret }),
      ).toEqual(["INTERNAL_API_KEY"]);
    });

    it("aceita segredo em hex gerado com 32 bytes", () => {
      const result = envSchema.safeParse({
        ...prodEnv,
        JWT_SECRET:
          "57e5abe93e337ab523e0cb1ad3229967810e87d2bee3a8ee1438ed3daba4bfad",
      });

      expect(result.success).toBe(true);
    });

    it("não expõe o valor do segredo na mensagem de erro", () => {
      const weak = "ab".repeat(20);
      const messages = [
        ...issuesFor({ ...prodEnv, JWT_SECRET: exampleSecret }),
        ...issuesFor({ ...prodEnv, INTERNAL_API_KEY: weak }),
        ...issuesFor({ ...prodEnv, INTERNAL_API_KEY: strongJwtSecret }),
      ].map((issue) => issue.message);

      expect(messages).toHaveLength(3);
      for (const message of messages) {
        expect(message).not.toContain(exampleSecret);
        expect(message).not.toContain(weak);
        expect(message).not.toContain(strongJwtSecret);
      }
    });

    it("não aplica as regras de segredo fora de produção", () => {
      expect(envSchema.safeParse(baseEnv).success).toBe(true);
      expect(
        envSchema.safeParse({ ...baseEnv, JWT_SECRET: exampleSecret }).success,
      ).toBe(true);
    });
  });

  describe("driver de e-mail", () => {
    const { MAIL_DRIVER: _driver, ...withoutDriver } = baseEnv;

    it("aceita MAIL_DRIVER=console sem RESEND_API_KEY em development", () => {
      expect(envSchema.safeParse(baseEnv).success).toBe(true);
    });

    it("exige RESEND_API_KEY ou MAIL_DRIVER=console em development", () => {
      const issues = issuesFor(withoutDriver);

      expect(issues.map((issue) => issue.path.join("."))).toEqual([
        "RESEND_API_KEY",
      ]);
      expect(issues[0]?.message).toContain("MAIL_DRIVER=console");
    });

    it("não cai no console em silêncio num staging com NODE_ENV=development", () => {
      expect(
        envSchema.safeParse({ ...withoutDriver, NODE_ENV: "development" })
          .success,
      ).toBe(false);
    });

    it("aceita RESEND_API_KEY sem MAIL_DRIVER em development", () => {
      expect(
        envSchema.safeParse({ ...withoutDriver, RESEND_API_KEY: "re_chave" })
          .success,
      ).toBe(true);
    });

    it("exige RESEND_API_KEY quando MAIL_DRIVER=resend", () => {
      expect(issuePaths({ ...baseEnv, MAIL_DRIVER: "resend" })).toEqual([
        "RESEND_API_KEY",
      ]);
    });

    it("não exige nada de e-mail em test", () => {
      expect(
        envSchema.safeParse({ ...withoutDriver, NODE_ENV: "test" }).success,
      ).toBe(true);
    });

    it("recusa MAIL_DRIVER=console em produção mesmo com RESEND_API_KEY", () => {
      expect(issuePaths({ ...prodEnv, MAIL_DRIVER: "console" })).toEqual([
        "MAIL_DRIVER",
      ]);
    });

    it("rejeita MAIL_DRIVER desconhecido", () => {
      expect(issuePaths({ ...baseEnv, MAIL_DRIVER: "smtp" })).toEqual([
        "MAIL_DRIVER",
      ]);
    });
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

describe("pool do banco", () => {
  it("aplica os defaults dimensionados para o piloto", () => {
    const result = envSchema.safeParse(baseEnv);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.DATABASE_POOL_MAX).toBe(5);
    expect(result.data.DATABASE_POOL_CONNECTION_TIMEOUT_MS).toBe(2000);
    expect(result.data.DATABASE_STATEMENT_TIMEOUT_MS).toBe(3000);
  });

  it("converte os valores recebidos como string", () => {
    const result = envSchema.safeParse({
      ...baseEnv,
      DATABASE_POOL_MAX: "8",
    });

    expect(result.success && result.data.DATABASE_POOL_MAX).toBe(8);
  });

  it("recusa statement_timeout que nao corta antes da transacao do Prisma", () => {
    expect(
      issuePaths({ ...baseEnv, DATABASE_STATEMENT_TIMEOUT_MS: "5000" }),
    ).toEqual(["DATABASE_STATEMENT_TIMEOUT_MS"]);
  });

  it("recusa pool grande demais para transacoes Serializable", () => {
    expect(issuePaths({ ...baseEnv, DATABASE_POOL_MAX: "50" })).toEqual([
      "DATABASE_POOL_MAX",
    ]);
  });

  it("recusa pool de uma conexao so em producao", () => {
    expect(issuePaths({ ...prodEnv, DATABASE_POOL_MAX: "1" })).toEqual([
      "DATABASE_POOL_MAX",
    ]);
  });

  it("aceita pool de uma conexao so fora de producao", () => {
    expect(issuePaths({ ...baseEnv, DATABASE_POOL_MAX: "1" })).toEqual([]);
  });
});
