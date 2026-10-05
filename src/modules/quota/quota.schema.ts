import { z } from "zod";

export const MAX_QUOTA_CONSUME = 50;

const month = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month deve estar no formato YYYY-MM");

export const consumeQuotaSchema = z.object({
  phoneNumberId: z
    .string()
    .trim()
    .min(1, "phoneNumberId é obrigatório")
    .max(64, "phoneNumberId deve ter no máximo 64 caracteres"),
  count: z.coerce
    .number()
    .int()
    .min(1, `count deve estar entre 1 e ${MAX_QUOTA_CONSUME}`)
    .max(MAX_QUOTA_CONSUME, `count deve estar entre 1 e ${MAX_QUOTA_CONSUME}`)
    .default(1),
});

export const usageQuerySchema = z.object({
  month: month.optional(),
});

export type ConsumeQuotaInput = z.infer<typeof consumeQuotaSchema>;
export type UsageQuery = z.infer<typeof usageQuerySchema>;
