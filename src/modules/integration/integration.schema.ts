import { z } from "zod";

export const integrationPhoneNumberIdParam = z.object({
  phoneNumberId: z
    .string()
    .trim()
    .min(1, "phoneNumberId é obrigatório")
    .max(64, "phoneNumberId deve ter no máximo 64 caracteres"),
});
