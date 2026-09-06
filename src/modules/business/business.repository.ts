import { prisma } from "../../shared/database/prisma";
import { getBusinessId } from "../../shared/tenant/tenant-context";
import type {
  BusinessHourInput,
  CreateClosedDayInput,
  CreateVacationInput,
  UpdateBusinessInput,
} from "./business.schema";

export type ClosedDayRecord = Omit<CreateClosedDayInput, "date"> & {
  date: Date;
};

export type VacationRecord = Omit<
  CreateVacationInput,
  "startDate" | "endDate"
> & {
  startDate: Date;
  endDate: Date;
};

const hourFields = {
  id: true,
  dayOfWeek: true,
  opensAt: true,
  closesAt: true,
} as const;

const closedDayFields = {
  id: true,
  date: true,
  reason: true,
} as const;

const vacationFields = {
  id: true,
  employeeId: true,
  startDate: true,
  endDate: true,
  reason: true,
} as const;

const publicBusinessFields = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  phone: true,
  metaPhoneNumberId: true,
  metaWabaId: true,
  aiSystemPrompt: true,
  slotIntervalMinutes: true,
  bufferMinutes: true,
  createdAt: true,
  updatedAt: true,
} as const;

const businessWithSchedule = {
  ...publicBusinessFields,
  hours: { select: hourFields, orderBy: { dayOfWeek: "asc" } },
  closedDays: { select: closedDayFields, orderBy: { date: "asc" } },
  vacations: { select: vacationFields, orderBy: { startDate: "asc" } },
} as const;

export const businessRepository = {
  findCurrent() {
    return prisma.business.findFirst({
      where: { id: getBusinessId() },
      select: businessWithSchedule,
    });
  },

  findByMetaPhoneNumberId(phoneNumberId: string) {
    return prisma.business.findUnique({
      where: { metaPhoneNumberId: phoneNumberId },
      select: { id: true, name: true, timezone: true, aiSystemPrompt: true },
    });
  },

  update(data: UpdateBusinessInput) {
    return prisma.business.update({
      where: { id: getBusinessId() },
      data,
      select: businessWithSchedule,
    });
  },

  delete() {
    return prisma.business.delete({
      where: { id: getBusinessId() },
      select: { id: true },
    });
  },

  async setHours(hours: BusinessHourInput[]) {
    const businessId = getBusinessId();
    await prisma.$transaction(async (tx) => {
      await tx.businessHours.deleteMany({ where: { businessId } });
      if (hours.length) {
        await tx.businessHours.createMany({
          data: hours.map((hour) => ({ ...hour, businessId })),
        });
      }
    });
    return prisma.businessHours.findMany({
      where: { businessId },
      select: hourFields,
      orderBy: { dayOfWeek: "asc" },
    });
  },

  listClosedDays() {
    return prisma.closedDay.findMany({
      where: { businessId: getBusinessId() },
      select: closedDayFields,
      orderBy: { date: "asc" },
    });
  },

  addClosedDay(data: ClosedDayRecord) {
    return prisma.closedDay.create({
      data: { ...data, businessId: getBusinessId() },
      select: closedDayFields,
    });
  },

  deleteClosedDay(id: string) {
    return prisma.closedDay.deleteMany({
      where: { id, businessId: getBusinessId() },
    });
  },

  listVacations() {
    return prisma.vacation.findMany({
      where: { businessId: getBusinessId() },
      select: vacationFields,
      orderBy: { startDate: "asc" },
    });
  },

  addVacation(data: VacationRecord) {
    return prisma.vacation.create({
      data: { ...data, businessId: getBusinessId() },
      select: vacationFields,
    });
  },

  deleteVacation(id: string) {
    return prisma.vacation.deleteMany({
      where: { id, businessId: getBusinessId() },
    });
  },
};
