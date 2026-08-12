import { prisma } from "../../shared/database/prisma";
import { getBusinessId } from "../../shared/tenant/tenant-context";
import type {
  BusinessHourInput,
  CreateBusinessInput,
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

const secretFields = {
  metaAccessToken: true,
  metaAppSecret: true,
} as const;

export const businessRepository = {
  create(data: CreateBusinessInput) {
    return prisma.business.create({ data, omit: secretFields });
  },

  findCurrent() {
    return prisma.business.findUnique({
      where: { id: getBusinessId() },
      omit: secretFields,
      include: {
        hours: { orderBy: { dayOfWeek: "asc" } },
        closedDays: { orderBy: { date: "asc" } },
        vacations: { orderBy: { startDate: "asc" } },
      },
    });
  },

  update(data: UpdateBusinessInput) {
    return prisma.business.update({
      where: { id: getBusinessId() },
      data,
      omit: secretFields,
    });
  },

  delete() {
    return prisma.business.delete({ where: { id: getBusinessId() } });
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
      orderBy: { dayOfWeek: "asc" },
    });
  },

  listClosedDays() {
    return prisma.closedDay.findMany({
      where: { businessId: getBusinessId() },
      orderBy: { date: "asc" },
    });
  },

  addClosedDay(data: ClosedDayRecord) {
    return prisma.closedDay.create({
      data: { ...data, businessId: getBusinessId() },
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
      orderBy: { startDate: "asc" },
    });
  },

  addVacation(data: VacationRecord) {
    return prisma.vacation.create({
      data: { ...data, businessId: getBusinessId() },
    });
  },

  deleteVacation(id: string) {
    return prisma.vacation.deleteMany({
      where: { id, businessId: getBusinessId() },
    });
  },
};
