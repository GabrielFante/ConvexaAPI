import { z } from "zod";
import { dayOfWeek, minuteOfDay, uuid } from "../../shared/validation/common";

export const createBusinessSchema = z.object({
  name: z.string().trim().min(1, "name é obrigatório"),
  slug: z
    .string()
    .trim()
    .min(1, "slug é obrigatório")
    .regex(
      /^[a-z0-9-]+$/,
      "slug deve conter apenas letras minúsculas, números e hífens",
    ),
  timezone: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  metaPhoneNumberId: z.string().trim().min(1).optional(),
  metaAccessToken: z.string().trim().min(1).optional(),
  aiSystemPrompt: z.string().trim().min(1).optional(),
  slotIntervalMinutes: z
    .number()
    .int()
    .min(5, "slotIntervalMinutes deve estar entre 5 e 240")
    .max(240, "slotIntervalMinutes deve estar entre 5 e 240")
    .optional(),
  bufferMinutes: z
    .number()
    .int()
    .min(0, "bufferMinutes deve estar entre 0 e 120")
    .max(120, "bufferMinutes deve estar entre 0 e 120")
    .optional(),
});

export const updateBusinessSchema = createBusinessSchema.partial();

const businessHourSchema = z
  .object({
    dayOfWeek,
    opensAt: minuteOfDay,
    closesAt: minuteOfDay,
  })
  .refine((data) => data.opensAt < data.closesAt, {
    message: "opensAt deve ser menor que closesAt",
    path: ["closesAt"],
  });

export const setBusinessHoursSchema = z.object({
  hours: z.array(businessHourSchema),
});

export const createClosedDaySchema = z.object({
  date: z.coerce.date(),
  reason: z.string().trim().min(1).optional(),
});

export const createVacationSchema = z
  .object({
    employeeId: uuid.optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "startDate deve ser menor ou igual a endDate",
    path: ["endDate"],
  });

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type BusinessHourInput = z.infer<typeof businessHourSchema>;
export type CreateClosedDayInput = z.infer<typeof createClosedDaySchema>;
export type CreateVacationInput = z.infer<typeof createVacationSchema>;
