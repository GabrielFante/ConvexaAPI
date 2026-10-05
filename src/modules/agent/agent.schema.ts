import { z } from "zod";
import { createAppointmentSchema } from "../appointment/appointment.schema";
import { resolveCustomerSchema } from "../customer/customer.schema";
import { availabilityQuerySchema } from "../scheduling/scheduling.schema";

export const AGENT_MAX_SLOTS = 10;

export const agentSessionSchema = resolveCustomerSchema.extend({
  phoneNumberId: z
    .string()
    .trim()
    .min(1, "phoneNumberId é obrigatório")
    .max(64, "phoneNumberId deve ter no máximo 64 caracteres"),
});

export const agentAvailabilitySchema = availabilityQuerySchema
  .omit({ slotIntervalMinutes: true })
  .extend({
    limit: z.coerce
      .number()
      .int()
      .min(1, `limit deve estar entre 1 e ${AGENT_MAX_SLOTS}`)
      .max(AGENT_MAX_SLOTS, `limit deve estar entre 1 e ${AGENT_MAX_SLOTS}`)
      .default(3),
  });

export const agentBookSchema = createAppointmentSchema.omit({
  customerId: true,
});

export type AgentSessionInput = z.infer<typeof agentSessionSchema>;
export type AgentAvailabilityQuery = z.infer<typeof agentAvailabilitySchema>;
export type AgentBookInput = z.infer<typeof agentBookSchema>;
