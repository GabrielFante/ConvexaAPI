import { prisma } from "../../shared/database/prisma";
import { getBusinessId } from "../../shared/tenant/tenant-context";
import {
  calendarDayAsDate,
  zonedDayToUtc,
  type CalendarDay,
} from "../../shared/utils/timezone";
import type { ScheduleConfig, ScheduleData } from "./scheduling.types";

const MINUTE_MS = 60_000;

const appointmentInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  employee: { select: { id: true, name: true } },
  service: { select: { id: true, name: true, durationMinutes: true } },
} as const;

const activeStatuses = ["SCHEDULED", "CONFIRMED", "COMPLETED"] as const;

export type ScheduleDataQuery = {
  day: CalendarDay;
  timezone: string;
  employeeIds: string[];
  paddingMinutes: number;
};

export type AppointmentWrite = {
  customerId: string;
  employeeId: string;
  serviceId: string;
  startAt: Date;
  endAt: Date;
  priceCents: number;
  durationMinutes: number;
  notes?: string;
};

export type AppointmentReschedule = {
  employeeId: string;
  startAt: Date;
  endAt: Date;
};

function overlappingWhere(employeeIds: string[], start: Date, end: Date) {
  return {
    businessId: getBusinessId(),
    employeeId: { in: employeeIds },
    status: { in: [...activeStatuses] },
    startAt: { lt: end },
    endAt: { gt: start },
  };
}

export const schedulingRepository = {
  async getConfig(): Promise<ScheduleConfig | null> {
    const business = await prisma.business.findUnique({
      where: { id: getBusinessId() },
      select: {
        timezone: true,
        slotIntervalMinutes: true,
        bufferMinutes: true,
      },
    });

    return business;
  },

  listEligibleEmployees(serviceId: string, employeeId?: string) {
    return prisma.employee.findMany({
      where: {
        businessId: getBusinessId(),
        active: true,
        services: { some: { serviceId } },
        ...(employeeId ? { id: employeeId } : {}),
      },
      select: {
        id: true,
        hours: { select: { dayOfWeek: true, startsAt: true, endsAt: true } },
      },
      orderBy: { name: "asc" },
    });
  },

  async loadScheduleData(query: ScheduleDataQuery): Promise<ScheduleData> {
    const businessId = getBusinessId();
    const padding = query.paddingMinutes * MINUTE_MS;
    const rangeStart = new Date(
      zonedDayToUtc(query.day, 0, query.timezone).getTime() - padding,
    );
    const rangeEnd = new Date(
      zonedDayToUtc(query.day, 24 * 60, query.timezone).getTime() + padding,
    );
    const date = calendarDayAsDate(query.day);

    const [businessHours, closedDays, vacations, timeBlocks, appointments] =
      await Promise.all([
        prisma.businessHours.findMany({
          where: { businessId },
          select: { dayOfWeek: true, opensAt: true, closesAt: true },
        }),
        prisma.closedDay.findMany({
          where: { businessId, date },
          select: { date: true },
        }),
        prisma.vacation.findMany({
          where: {
            businessId,
            startDate: { lte: date },
            endDate: { gte: date },
            OR: [
              { employeeId: null },
              { employeeId: { in: query.employeeIds } },
            ],
          },
          select: { employeeId: true, startDate: true, endDate: true },
        }),
        prisma.timeBlock.findMany({
          where: {
            businessId,
            startAt: { lt: rangeEnd },
            endAt: { gt: rangeStart },
            OR: [
              { employeeId: null },
              { employeeId: { in: query.employeeIds } },
            ],
          },
          select: { employeeId: true, startAt: true, endAt: true },
        }),
        prisma.appointment.findMany({
          where: overlappingWhere(query.employeeIds, rangeStart, rangeEnd),
          select: { id: true, employeeId: true, startAt: true, endAt: true },
        }),
      ]);

    return {
      businessHours,
      closedDates: closedDays.map((closedDay) => closedDay.date),
      vacations,
      timeBlocks,
      appointments,
      employees: [],
    };
  },

  async findById(id: string) {
    return prisma.appointment.findFirst({
      where: { id, businessId: getBusinessId() },
      include: appointmentInclude,
    });
  },

  create(data: AppointmentWrite) {
    const businessId = getBusinessId();

    return prisma.$transaction(
      async (tx) => {
        const conflict = await tx.appointment.findFirst({
          where: {
            businessId,
            employeeId: data.employeeId,
            status: { in: [...activeStatuses] },
            startAt: { lt: data.endAt },
            endAt: { gt: data.startAt },
          },
          select: { id: true },
        });

        if (conflict) {
          return null;
        }

        return tx.appointment.create({
          data: { ...data, businessId },
          include: appointmentInclude,
        });
      },
      { isolationLevel: "Serializable" },
    );
  },

  reschedule(id: string, data: AppointmentReschedule) {
    const businessId = getBusinessId();

    return prisma.$transaction(
      async (tx) => {
        const conflict = await tx.appointment.findFirst({
          where: {
            businessId,
            employeeId: data.employeeId,
            id: { not: id },
            status: { in: [...activeStatuses] },
            startAt: { lt: data.endAt },
            endAt: { gt: data.startAt },
          },
          select: { id: true },
        });

        if (conflict) {
          return null;
        }

        return tx.appointment.update({
          where: { id },
          data,
          include: appointmentInclude,
        });
      },
      { isolationLevel: "Serializable" },
    );
  },

  async updateStatus(
    id: string,
    status: "CANCELLED" | "CONFIRMED" | "COMPLETED",
  ) {
    return prisma.appointment.update({
      where: { id },
      data: { status },
      include: appointmentInclude,
    });
  },
};
