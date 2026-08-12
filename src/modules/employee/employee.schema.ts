import { z } from "zod";
import {
  dayOfWeek,
  hasOverlappingRanges,
  minuteOfDay,
  OVERLAPPING_RANGES_MESSAGE,
  uuid,
} from "../../shared/validation/common";

export const employeeHourSchema = z
  .object({
    dayOfWeek,
    startsAt: minuteOfDay,
    endsAt: minuteOfDay,
  })
  .refine((data) => data.startsAt < data.endsAt, {
    message: "startsAt deve ser menor que endsAt",
    path: ["endsAt"],
  });

const employeeHoursArray = z.array(employeeHourSchema).refine(
  (hours) =>
    !hasOverlappingRanges(
      hours.map((hour) => ({
        dayOfWeek: hour.dayOfWeek,
        start: hour.startsAt,
        end: hour.endsAt,
      })),
    ),
  { message: OVERLAPPING_RANGES_MESSAGE },
);

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1, "name é obrigatório"),
  active: z.boolean().optional(),
  serviceIds: z.array(uuid).optional(),
  hours: employeeHoursArray.optional(),
});

export const updateEmployeeSchema = z.object({
  name: z.string().trim().min(1, "name é obrigatório").optional(),
  active: z.boolean().optional(),
});

export const setEmployeeServicesSchema = z.object({
  serviceIds: z.array(uuid),
});

export const setEmployeeHoursSchema = z.object({
  hours: employeeHoursArray,
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type EmployeeHourInput = z.infer<typeof employeeHourSchema>;
