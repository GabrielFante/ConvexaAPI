import { z } from "zod";

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

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
