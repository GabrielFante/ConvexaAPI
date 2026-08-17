import { z } from "zod";
import { instant, uuid } from "../../shared/validation/common";

export const createAppointmentSchema = z.object({
  customerId: uuid,
  serviceId: uuid,
  employeeId: uuid,
  startAt: instant,
  notes: z.string().trim().min(1).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
