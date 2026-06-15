import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, "name é obrigatório"),
  phone: z.string().trim().min(1, "phone é obrigatório"),
  notes: z.string().trim().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
