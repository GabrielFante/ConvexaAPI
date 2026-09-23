import { z } from "zod";

const id = z.uuid();
const instant = z.iso.datetime();

export const apiErrorSchema = z.object({
  status: z.literal("error"),
  code: z.string().optional(),
  message: z.string(),
  issues: z
    .array(z.object({ field: z.string(), message: z.string() }))
    .optional(),
});

export const pageMetaSchema = z.object({
  page: z.int(),
  perPage: z.int(),
  total: z.int(),
  totalPages: z.int(),
});

export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: pageMetaSchema });
}

export const businessHoursSchema = z.object({
  id,
  dayOfWeek: z.int().min(0).max(6),
  opensAt: z.int().min(0).max(1440),
  closesAt: z.int().min(0).max(1440),
});

export const closedDaySchema = z.object({
  id,
  date: instant,
  reason: z.string().nullable(),
});

export const vacationSchema = z.object({
  id,
  employeeId: id.nullable(),
  startDate: instant,
  endDate: instant,
  reason: z.string().nullable(),
});

export const businessSchema = z.object({
  id,
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
  phone: z.string().nullable(),
  metaPhoneNumberId: z.string().nullable(),
  metaWabaId: z.string().nullable(),
  aiSystemPrompt: z.string().nullable(),
  slotIntervalMinutes: z.int(),
  bufferMinutes: z.int(),
  createdAt: instant,
  updatedAt: instant,
  hours: z.array(businessHoursSchema),
  closedDays: z.array(closedDaySchema),
  vacations: z.array(vacationSchema),
});

export const tenantByPhoneNumberIdSchema = z.object({
  id,
  name: z.string(),
  timezone: z.string(),
  aiSystemPrompt: z.string().nullable(),
});

export const serviceSchema = z.object({
  id,
  name: z.string(),
  durationMinutes: z.int(),
  priceCents: z.int(),
  active: z.boolean(),
  createdAt: instant,
  updatedAt: instant,
});

export const employeeHoursSchema = z.object({
  id,
  dayOfWeek: z.int().min(0).max(6),
  startsAt: z.int().min(0).max(1440),
  endsAt: z.int().min(0).max(1440),
});

export const employeeSchema = z.object({
  id,
  name: z.string(),
  active: z.boolean(),
  createdAt: instant,
  updatedAt: instant,
  services: z.array(z.object({ serviceId: id })),
  hours: z.array(employeeHoursSchema),
});

export const customerSchema = z.object({
  id,
  name: z.string(),
  phone: z.string(),
  notes: z.string().nullable(),
  createdAt: instant,
  updatedAt: instant,
});

export const timeBlockSchema = z.object({
  id,
  employeeId: id.nullable(),
  startAt: instant,
  endAt: instant,
  reason: z.string().nullable(),
});

export const appointmentStatusSchema = z.enum([
  "SCHEDULED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
]);

export const appointmentSchema = z.object({
  id,
  customerId: id,
  employeeId: id,
  serviceId: id,
  startAt: instant,
  endAt: instant,
  status: appointmentStatusSchema,
  priceCents: z.int(),
  durationMinutes: z.int(),
  notes: z.string().nullable(),
  createdAt: instant,
  updatedAt: instant,
  customer: z.object({ id, name: z.string(), phone: z.string() }),
  employee: z.object({ id, name: z.string() }),
  service: z.object({ id, name: z.string(), durationMinutes: z.int() }),
});

export const availabilitySlotSchema = z.object({
  employeeId: id,
  startAt: instant,
  endAt: instant,
});

export const availabilitySchema = z.object({
  date: z.string(),
  serviceId: id,
  durationMinutes: z.int(),
  totalSlots: z.int(),
  slots: z.array(availabilitySlotSchema),
});

export const sessionUserSchema = z.object({
  id,
  name: z.string(),
  email: z.email(),
  role: z.enum(["OWNER", "STAFF"]),
});

export const sessionBusinessSchema = z.object({
  id,
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
});

export const sessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.int(),
  user: sessionUserSchema,
  business: sessionBusinessSchema,
});

export const profileSchema = z.object({
  id,
  name: z.string(),
  email: z.email(),
  role: z.enum(["OWNER", "STAFF"]),
  active: z.boolean(),
  business: sessionBusinessSchema,
});

export const healthSchema = z.object({
  status: z.literal("ok"),
  uptime: z.number(),
  timestamp: instant,
});

export const readinessSchema = z.object({
  status: z.enum(["ok", "unavailable"]),
  code: z.enum(["SHUTTING_DOWN", "DATABASE_UNAVAILABLE"]).optional(),
});
