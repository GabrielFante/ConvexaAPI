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
    RESEND_API_KEY: z.string().trim().min(1).optional(),
    MAIL_FROM: z
      .string()
      .trim()
      .min(1)
      .default("Convexa <onboarding@resend.dev>"),
  })
  .superRefine((data, ctx) => {
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

    if (!data.RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY é obrigatória quando NODE_ENV=production",
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
