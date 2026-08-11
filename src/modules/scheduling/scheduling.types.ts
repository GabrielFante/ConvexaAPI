import type { CalendarDay } from "../../shared/utils/timezone";

export type MinuteInterval = {
  start: number;
  end: number;
};

export type TimeInterval = {
  start: Date;
  end: Date;
};

export type BusinessHourRule = {
  dayOfWeek: number;
  opensAt: number;
  closesAt: number;
};

export type EmployeeHourRule = {
  dayOfWeek: number;
  startsAt: number;
  endsAt: number;
};

export type EmployeeSchedule = {
  employeeId: string;
  hours: EmployeeHourRule[];
};

export type VacationRule = {
  employeeId: string | null;
  startDate: Date;
  endDate: Date;
};

export type TimeBlockRule = {
  employeeId: string | null;
  startAt: Date;
  endAt: Date;
};

export type BookedAppointment = {
  id: string;
  employeeId: string;
  startAt: Date;
  endAt: Date;
};

export type ScheduleConfig = {
  timezone: string;
  slotIntervalMinutes: number;
  bufferMinutes: number;
};

export type ScheduleData = {
  businessHours: BusinessHourRule[];
  closedDates: Date[];
  vacations: VacationRule[];
  timeBlocks: TimeBlockRule[];
  appointments: BookedAppointment[];
  employees: EmployeeSchedule[];
};

export type ScheduleContext = ScheduleConfig &
  ScheduleData & {
    day: CalendarDay;
    durationMinutes: number;
    now: Date;
  };

export type AvailabilitySlot = {
  employeeId: string;
  startAt: Date;
  endAt: Date;
};

export type SlotViolation =
  | "PAST"
  | "CLOSED_DAY"
  | "BUSINESS_VACATION"
  | "EMPLOYEE_VACATION"
  | "OUTSIDE_BUSINESS_HOURS"
  | "OUTSIDE_EMPLOYEE_HOURS"
  | "TIME_BLOCK"
  | "APPOINTMENT_CONFLICT";

export type SlotRequest = {
  employeeId: string;
  startAt: Date;
  endAt: Date;
  ignoreAppointmentId?: string;
};
