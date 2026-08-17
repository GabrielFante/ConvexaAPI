import { z } from "zod";
import { instant, uuid } from "../../shared/validation/common";

export const createAppointmentSchema = z.object({
  customerId: uuid,
  serviceId: uuid,
  employeeId: uuid,
  startAt: instant,
  notes: z.string().trim().min(1).optional(),
});

export const listAppointmentsSchema = z
  .object({
    customerId: uuid.optional(),
    employeeId: uuid.optional(),
    status: z
      .enum(["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED"])
      .optional(),
    from: instant.optional(),
    to: instant.optional(),
  })
  .refine((data) => !data.from || !data.to || data.from < data.to, {
    message: "to deve ser maior que from",
    path: ["to"],
  });

export const rescheduleAppointmentSchema = z.object({
  startAt: instant,
  employeeId: uuid.optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type ListAppointmentsFilter = z.infer<typeof listAppointmentsSchema>;
export type RescheduleAppointmentInput = z.infer<
  typeof rescheduleAppointmentSchema
>;
