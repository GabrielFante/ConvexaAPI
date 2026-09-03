import { z } from "zod";
import { createBusinessSchema } from "../business/business.schema";

const email = z.string().trim().toLowerCase().pipe(z.email("E-mail inválido"));

const password = z
  .string()
  .min(8, "A senha deve ter no mínimo 8 caracteres")
  .max(72, "A senha deve ter no máximo 72 caracteres");

export const registerBusinessSchema = createBusinessSchema.pick({
  name: true,
  slug: true,
  timezone: true,
  phone: true,
  slotIntervalMinutes: true,
  bufferMinutes: true,
});

export const registerSchema = z.object({
  business: registerBusinessSchema,
  owner: z.object({
    name: z.string().trim().min(1, "name é obrigatório"),
    email,
    password,
  }),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "password é obrigatório"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1, "refreshToken é obrigatório"),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "token é obrigatório"),
  password,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type RegisterBusinessInput = z.infer<typeof registerBusinessSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
