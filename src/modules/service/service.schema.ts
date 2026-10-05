import { z } from "zod";
import { falseByDefaultQuery } from "../../shared/validation/common";
import { paginationQuerySchema } from "../../shared/validation/pagination";

export const createServiceSchema = z.object({
  name: z.string().trim().min(1, "name é obrigatório"),
  durationMinutes: z
    .number()
    .int()
    .positive("durationMinutes deve ser maior que zero"),
  priceCents: z.number().int().nonnegative("priceCents não pode ser negativo"),
  active: z.boolean().optional(),
});

export const updateServiceSchema = createServiceSchema.partial();

export const listServiceQuerySchema = paginationQuerySchema.extend({
  includeInactive: falseByDefaultQuery,
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
export type ListServiceQuery = z.infer<typeof listServiceQuerySchema>;
