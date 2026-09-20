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

export const falseByDefaultQuery = z
  .enum(["true", "false"], "Use true ou false")
  .default("false")
  .transform((value) => value === "true");

export const instant = z.iso
  .datetime({ offset: true, message: "Use data e hora ISO-8601 com fuso" })
  .pipe(z.coerce.date());

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

type DayRange = { dayOfWeek: number; start: number; end: number };

export const OVERLAPPING_RANGES_MESSAGE =
  "Faixas de horário do mesmo dia da semana não podem se sobrepor";

export function hasOverlappingRanges(ranges: DayRange[]): boolean {
  const byDayOfWeek = new Map<number, DayRange[]>();

  for (const range of ranges) {
    const sameDay = byDayOfWeek.get(range.dayOfWeek) ?? [];
    sameDay.push(range);
    byDayOfWeek.set(range.dayOfWeek, sameDay);
  }

  for (const sameDay of byDayOfWeek.values()) {
    let maxEnd = Number.NEGATIVE_INFINITY;

    for (const range of [...sameDay].sort((a, b) => a.start - b.start)) {
      if (range.start < maxEnd) {
        return true;
      }

      maxEnd = Math.max(maxEnd, range.end);
    }
  }

  return false;
}

export const timeRange = z
  .object({ startsAt: minuteOfDay, endsAt: minuteOfDay })
  .refine((data) => data.startsAt < data.endsAt, {
    message: "startsAt deve ser menor que endsAt",
    path: ["endsAt"],
  });
