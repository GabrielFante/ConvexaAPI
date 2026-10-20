import { z } from "zod";
import {
  createAppointmentSchema,
  rescheduleAppointmentSchema,
} from "../appointment/appointment.schema";
import { resolveCustomerSchema } from "../customer/customer.schema";
import { availabilityQuerySchema } from "../scheduling/scheduling.schema";

export const CONVERSATION_MAX_SLOTS = 10;

export const conversationSessionSchema = resolveCustomerSchema.extend({
  phoneNumberId: z
    .string()
    .trim()
    .min(1, "phoneNumberId é obrigatório")
    .max(64, "phoneNumberId deve ter no máximo 64 caracteres"),
});

export const conversationAvailabilitySchema = availabilityQuerySchema
  .omit({ slotIntervalMinutes: true })
  .extend({
    limit: z.coerce
      .number()
      .int()
      .min(1, `limit deve estar entre 1 e ${CONVERSATION_MAX_SLOTS}`)
      .max(
        CONVERSATION_MAX_SLOTS,
        `limit deve estar entre 1 e ${CONVERSATION_MAX_SLOTS}`,
      )
      .default(3),
  });

export const conversationBookSchema = createAppointmentSchema.omit({
  customerId: true,
});

export const conversationRescheduleSchema = rescheduleAppointmentSchema;

export type ConversationSessionInput = z.infer<
  typeof conversationSessionSchema
>;
export type ConversationAvailabilityQuery = z.infer<
  typeof conversationAvailabilitySchema
>;
export type ConversationBookInput = z.infer<typeof conversationBookSchema>;
export type ConversationRescheduleInput = z.infer<
  typeof conversationRescheduleSchema
>;
