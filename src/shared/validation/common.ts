import { z } from "zod";
import { parseCalendarDay } from "../utils/timezone";

export const uuid = z.uuid("Identificador inválido");

function isCalendarDate(value: string): boolean {
  try {
    parseCalendarDay(value);
    return true;
  } catch {
    return false;
  }
}

export const calendarDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD")
  .refine(isCalendarDate, { message: "Data inexistente no calendário" });

export const idParam = z.object({ id: uuid });

const supportedTimezones = new Set(Intl.supportedValuesOf("timeZone"));

export const timezone = z
  .string()
  .trim()
  .refine((value) => supportedTimezones.has(value), {
    message: "timezone deve ser um fuso horário IANA válido",
  });

export const dayOfWeek = z
  .number()
  .int()
  .min(0, "dayOfWeek deve estar entre 0 e 6")
  .max(6, "dayOfWeek deve estar entre 0 e 6");

export const minuteOfDay = z
  .number()
  .int()
  .min(0, "Horário deve estar entre 0 e 1440 minutos")
  .max(1440, "Horário deve estar entre 0 e 1440 minutos");

export const timeRange = z
  .object({ startsAt: minuteOfDay, endsAt: minuteOfDay })
  .refine((data) => data.startsAt < data.endsAt, {
    message: "startsAt deve ser menor que endsAt",
    path: ["endsAt"],
  });
