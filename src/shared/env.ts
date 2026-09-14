import "dotenv/config";
import { z } from "zod";

const originList = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  );

const SECRET_PLACEHOLDER_WORDS = [
  "troque",
  "changeme",
  "secret",
  "senha",
  "password",
  "teste",
  "exemplo",
  "example",
  "convexa",
];

const MIN_DISTINCT_SECRET_CHARS = 12;

const SECRET_NAMES = ["JWT_SECRET", "INTERNAL_API_KEY"] as const;

function weakSecretMessage(name: string, value: string): string | undefined {
  const normalized = value.toLowerCase();

  if (SECRET_PLACEHOLDER_WORDS.some((word) => normalized.includes(word))) {
    return `${name} parece um valor de exemplo; gere um segredo aleatório`;
  }

  if (new Set(value).size < MIN_DISTINCT_SECRET_CHARS) {
    return `${name} tem pouca variedade de caracteres; gere um segredo aleatório`;
  }

  return undefined;
}

const MAIL_DRIVERS = ["resend", "console"] as const;

type MailConfig = {
  PASSWORD_RESET_ENABLED: boolean;
  NODE_ENV: "development" | "production" | "test";
  RESEND_API_KEY?: string;
  MAIL_DRIVER?: (typeof MAIL_DRIVERS)[number];
};

function mailConfigIssue(
  data: MailConfig,
): { path: string[]; message: string } | undefined {
  if (data.NODE_ENV === "production" && data.MAIL_DRIVER === "console") {
    return {
      path: ["MAIL_DRIVER"],
      message: "MAIL_DRIVER=console não é permitido quando NODE_ENV=production",
    };
  }

  if (!data.PASSWORD_RESET_ENABLED && !data.MAIL_DRIVER) return undefined;

  if (data.RESEND_API_KEY || data.MAIL_DRIVER === "console") {
    return undefined;
  }

  if (data.MAIL_DRIVER === "resend") {
    return {
      path: ["RESEND_API_KEY"],
      message: "RESEND_API_KEY é obrigatória quando MAIL_DRIVER=resend",
    };
  }

  if (data.NODE_ENV === "test") {
    return undefined;
  }

  if (data.NODE_ENV === "production") {
    return {
      path: ["RESEND_API_KEY"],
      message: "RESEND_API_KEY é obrigatória quando NODE_ENV=production",
    };
  }

  return {
    path: ["RESEND_API_KEY"],
    message:
      "RESEND_API_KEY é obrigatória; para desenvolvimento local defina MAIL_DRIVER=console",
  };
}

export const envSchema = z
  .object({
    DATABASE_URL: z.url("DATABASE_URL deve ser uma URL de conexão válida"),
    DIRECT_URL: z
      .url("DIRECT_URL deve ser uma URL de conexão válida")
      .optional(),
    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    JWT_SECRET: z
      .string()
      .min(32, "JWT_SECRET deve ter no mínimo 32 caracteres"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    INTERNAL_API_KEY: z
      .string()
      .min(32, "INTERNAL_API_KEY deve ter no mínimo 32 caracteres"),
    CORS_ORIGINS: originList,
    APP_URL: z
      .url("APP_URL deve ser a URL do painel web")
      .default("http://localhost:5173"),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    PASSWORD_RESET_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    RESEND_API_KEY: z.string().trim().min(1).optional(),
    MAIL_DRIVER: z
      .enum(MAIL_DRIVERS, "MAIL_DRIVER deve ser resend ou console")
      .optional(),
    MAIL_FROM: z
      .string()
      .trim()
      .min(1)
      .default("Convexa <onboarding@resend.dev>"),
  })
  .superRefine((data, ctx) => {
    const mailIssue = mailConfigIssue(data);

    if (mailIssue) {
      ctx.addIssue({ code: "custom", ...mailIssue });
    }

    if (data.NODE_ENV !== "production") {
      return;
    }

    if (data.CORS_ORIGINS.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGINS"],
        message: "CORS_ORIGINS é obrigatória quando NODE_ENV=production",
      });
    }

    for (const name of SECRET_NAMES) {
      const message = weakSecretMessage(name, data[name]);

      if (message) {
        ctx.addIssue({ code: "custom", path: [name], message });
      }
    }

    if (data.JWT_SECRET === data.INTERNAL_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["INTERNAL_API_KEY"],
        message: "INTERNAL_API_KEY não pode ser igual ao JWT_SECRET",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:");
  for (const issue of parsed.error.issues) {
    console.error(`  • ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
