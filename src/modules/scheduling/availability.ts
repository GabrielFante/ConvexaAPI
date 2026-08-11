import {
  dayOfWeekOf,
  startOfCalendarDayUtc,
  zonedDayToUtc,
  type CalendarDay,
} from "../../shared/utils/timezone";
import type {
  AvailabilitySlot,
  MinuteInterval,
  ScheduleContext,
  SlotRequest,
  SlotViolation,
  TimeInterval,
} from "./scheduling.types";

const MINUTE_MS = 60_000;

function sortIntervals(intervals: MinuteInterval[]): MinuteInterval[] {
  return [...intervals].sort((a, b) => a.start - b.start);
}

export function mergeIntervals(intervals: MinuteInterval[]): MinuteInterval[] {
  const merged: MinuteInterval[] = [];

  for (const interval of sortIntervals(intervals)) {
    const last = merged[merged.length - 1];

    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
      continue;
    }

    merged.push({ ...interval });
  }

  return merged;
}

export function intersectIntervals(
  left: MinuteInterval[],
  right: MinuteInterval[],
): MinuteInterval[] {
  const result: MinuteInterval[] = [];

  for (const a of mergeIntervals(left)) {
    for (const b of mergeIntervals(right)) {
      const start = Math.max(a.start, b.start);
      const end = Math.min(a.end, b.end);

      if (start < end) {
        result.push({ start, end });
      }
    }
  }

  return sortIntervals(result);
}

function overlaps(a: TimeInterval, b: TimeInterval): boolean {
  return (
    a.start.getTime() < b.end.getTime() && a.end.getTime() > b.start.getTime()
  );
}

function coversDay(
  range: { startDate: Date; endDate: Date },
  day: CalendarDay,
): boolean {
  const target = startOfCalendarDayUtc(day);

  return (
    range.startDate.getTime() <= target && range.endDate.getTime() >= target
  );
}

export function isClosedDay(context: ScheduleContext): boolean {
  const target = startOfCalendarDayUtc(context.day);

  return context.closedDates.some((date) => date.getTime() === target);
}

export function isBusinessOnVacation(context: ScheduleContext): boolean {
  return context.vacations.some(
    (vacation) =>
      vacation.employeeId === null && coversDay(vacation, context.day),
  );
}

export function isEmployeeOnVacation(
  context: ScheduleContext,
  employeeId: string,
): boolean {
  return context.vacations.some(
    (vacation) =>
      vacation.employeeId === employeeId && coversDay(vacation, context.day),
  );
}

export function businessWindows(context: ScheduleContext): MinuteInterval[] {
  const dayOfWeek = dayOfWeekOf(context.day);

  return mergeIntervals(
    context.businessHours
      .filter((hour) => hour.dayOfWeek === dayOfWeek)
      .map((hour) => ({ start: hour.opensAt, end: hour.closesAt })),
  );
}

export function employeeWindows(
  context: ScheduleContext,
  employeeId: string,
): MinuteInterval[] {
  const employee = context.employees.find(
    (candidate) => candidate.employeeId === employeeId,
  );

  if (!employee) {
    return [];
  }

  const business = businessWindows(context);

  if (!business.length) {
    return [];
  }

  if (!employee.hours.length) {
    return business;
  }

  const dayOfWeek = dayOfWeekOf(context.day);
  const own = employee.hours
    .filter((hour) => hour.dayOfWeek === dayOfWeek)
    .map((hour) => ({ start: hour.startsAt, end: hour.endsAt }));

  if (!own.length) {
    return [];
  }

  return intersectIntervals(business, own);
}

function toUtcIntervals(
  context: ScheduleContext,
  windows: MinuteInterval[],
): TimeInterval[] {
  return windows.map((window) => ({
    start: zonedDayToUtc(context.day, window.start, context.timezone),
    end: zonedDayToUtc(context.day, window.end, context.timezone),
  }));
}

export function timeBlockIntervals(
  context: ScheduleContext,
  employeeId: string,
): TimeInterval[] {
  return context.timeBlocks
    .filter(
      (block) => block.employeeId === null || block.employeeId === employeeId,
    )
    .map((block) => ({ start: block.startAt, end: block.endAt }));
}

export function bookedIntervals(
  context: ScheduleContext,
  employeeId: string,
  ignoreAppointmentId?: string,
): TimeInterval[] {
  const buffer = context.bufferMinutes * MINUTE_MS;

  return context.appointments
    .filter(
      (appointment) =>
        appointment.employeeId === employeeId &&
        appointment.id !== ignoreAppointmentId,
    )
    .map((appointment) => ({
      start: new Date(appointment.startAt.getTime() - buffer),
      end: new Date(appointment.endAt.getTime() + buffer),
    }));
}

export function blockingIntervals(
  context: ScheduleContext,
  employeeId: string,
  ignoreAppointmentId?: string,
): TimeInterval[] {
  return [
    ...timeBlockIntervals(context, employeeId),
    ...bookedIntervals(context, employeeId, ignoreAppointmentId),
  ];
}

export function checkSlot(
  context: ScheduleContext,
  request: SlotRequest,
): SlotViolation | null {
  if (request.startAt.getTime() < context.now.getTime()) {
    return "PAST";
  }

  if (isClosedDay(context)) {
    return "CLOSED_DAY";
  }

  if (isBusinessOnVacation(context)) {
    return "BUSINESS_VACATION";
  }

  if (isEmployeeOnVacation(context, request.employeeId)) {
    return "EMPLOYEE_VACATION";
  }

  const slot = { start: request.startAt, end: request.endAt };

  const fitsIn = (windows: MinuteInterval[]) =>
    toUtcIntervals(context, windows).some(
      (window) =>
        slot.start.getTime() >= window.start.getTime() &&
        slot.end.getTime() <= window.end.getTime(),
    );

  if (!fitsIn(businessWindows(context))) {
    return "OUTSIDE_BUSINESS_HOURS";
  }

  if (!fitsIn(employeeWindows(context, request.employeeId))) {
    return "OUTSIDE_EMPLOYEE_HOURS";
  }

  const blocked = timeBlockIntervals(context, request.employeeId).some(
    (interval) => overlaps(slot, interval),
  );

  if (blocked) {
    return "TIME_BLOCK";
  }

  const conflicting = bookedIntervals(
    context,
    request.employeeId,
    request.ignoreAppointmentId,
  ).some((interval) => overlaps(slot, interval));

  if (conflicting) {
    return "APPOINTMENT_CONFLICT";
  }

  return null;
}

export function computeAvailability(
  context: ScheduleContext,
): AvailabilitySlot[] {
  if (isClosedDay(context) || isBusinessOnVacation(context)) {
    return [];
  }

  if (!businessWindows(context).length) {
    return [];
  }

  const step = Math.max(1, context.slotIntervalMinutes);
  const slots: AvailabilitySlot[] = [];

  for (const employee of context.employees) {
    if (isEmployeeOnVacation(context, employee.employeeId)) {
      continue;
    }

    const windows = employeeWindows(context, employee.employeeId);
    const busy = blockingIntervals(context, employee.employeeId);

    for (const window of windows) {
      const windowEnd = zonedDayToUtc(
        context.day,
        window.end,
        context.timezone,
      );

      for (
        let minute = window.start;
        minute + context.durationMinutes <= window.end;
        minute += step
      ) {
        const startAt = zonedDayToUtc(context.day, minute, context.timezone);
        const endAt = new Date(
          startAt.getTime() + context.durationMinutes * MINUTE_MS,
        );

        if (endAt.getTime() > windowEnd.getTime()) {
          continue;
        }

        if (startAt.getTime() < context.now.getTime()) {
          continue;
        }

        if (
          busy.some((interval) =>
            overlaps({ start: startAt, end: endAt }, interval),
          )
        ) {
          continue;
        }

        slots.push({ employeeId: employee.employeeId, startAt, endAt });
      }
    }
  }

  return slots.sort(
    (a, b) =>
      a.startAt.getTime() - b.startAt.getTime() ||
      a.employeeId.localeCompare(b.employeeId),
  );
}
