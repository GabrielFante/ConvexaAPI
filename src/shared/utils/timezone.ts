import { AppError } from "../errors/AppError";

export type CalendarDay = {
  year: number;
  month: number;
  day: number;
};

export type ZonedParts = CalendarDay & {
  dayOfWeek: number;
  minuteOfDay: number;
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timezone);

  if (cached) {
    return cached;
  }

  let formatter: Intl.DateTimeFormat;

  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    throw new AppError(`Timezone inválido: ${timezone}`, 500);
  }

  formatters.set(timezone, formatter);
  return formatter;
}

function localFieldsOf(date: Date, timezone: string) {
  const fields: Record<string, number> = {};

  for (const part of formatterFor(timezone).formatToParts(date)) {
    if (part.type !== "literal") {
      fields[part.type] = Number(part.value);
    }
  }

  return fields as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  };
}

function offsetMinutesAt(date: Date, timezone: string): number {
  const { year, month, day, hour, minute } = localFieldsOf(date, timezone);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const truncated = Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS;

  return (localAsUtc - truncated) / MINUTE_MS;
}

export function dayOfWeekOf(day: CalendarDay): number {
  return new Date(startOfCalendarDayUtc(day)).getUTCDay();
}

export function startOfCalendarDayUtc(day: CalendarDay): number {
  return Date.UTC(day.year, day.month - 1, day.day);
}

export function getZonedParts(date: Date, timezone: string): ZonedParts {
  const { year, month, day, hour, minute } = localFieldsOf(date, timezone);
  const calendarDay = { year, month, day };

  return {
    ...calendarDay,
    dayOfWeek: dayOfWeekOf(calendarDay),
    minuteOfDay: hour * 60 + minute,
  };
}

export function getCalendarDay(date: Date, timezone: string): CalendarDay {
  const { year, month, day } = localFieldsOf(date, timezone);
  return { year, month, day };
}

export function zonedDayToUtc(
  day: CalendarDay,
  minuteOfDay: number,
  timezone: string,
): Date {
  const wallClock = startOfCalendarDayUtc(day) + minuteOfDay * MINUTE_MS;
  const firstGuess =
    wallClock - offsetMinutesAt(new Date(wallClock), timezone) * MINUTE_MS;
  const offset = offsetMinutesAt(new Date(firstGuess), timezone);

  return new Date(wallClock - offset * MINUTE_MS);
}

export function parseCalendarDay(value: string): CalendarDay {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new AppError("Data inválida: use o formato YYYY-MM-DD", 400);
  }

  const day = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };

  const roundTrip = new Date(startOfCalendarDayUtc(day));

  if (
    roundTrip.getUTCFullYear() !== day.year ||
    roundTrip.getUTCMonth() + 1 !== day.month ||
    roundTrip.getUTCDate() !== day.day
  ) {
    throw new AppError(`Data inexistente no calendário: ${value}`, 400);
  }

  return day;
}

export function formatCalendarDay(day: CalendarDay): string {
  const month = String(day.month).padStart(2, "0");
  const dayOfMonth = String(day.day).padStart(2, "0");

  return `${day.year}-${month}-${dayOfMonth}`;
}

export function calendarDayAsDate(day: CalendarDay): Date {
  return new Date(startOfCalendarDayUtc(day));
}

export function addCalendarDays(day: CalendarDay, amount: number): CalendarDay {
  const shifted = new Date(startOfCalendarDayUtc(day) + amount * DAY_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}
