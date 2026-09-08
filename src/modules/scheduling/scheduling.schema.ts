import { z } from "zod";
import { calendarDate, uuid } from "../../shared/validation/common";

export const availabilityQuerySchema = z.object({
  serviceId: uuid,
  date: calendarDate,
  employeeId: uuid.optional(),
  slotIntervalMinutes: z.coerce
    .number()
    .int()
    .min(5, "slotIntervalMinutes deve estar entre 5 e 240")
    .max(240, "slotIntervalMinutes deve estar entre 5 e 240")
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, "limit deve estar entre 1 e 100")
    .max(100, "limit deve estar entre 1 e 100")
    .default(3),
});

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
