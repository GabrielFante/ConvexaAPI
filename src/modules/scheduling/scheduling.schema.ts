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
});

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
