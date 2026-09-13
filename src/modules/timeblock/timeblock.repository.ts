import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/AppError";
import { getBusinessId } from "../../shared/tenant/tenant-context";
import type {
  CreateTimeBlockInput,
  ListTimeBlocksFilter,
  UpdateTimeBlockInput,
} from "./timeblock.schema";

const timeBlockFields = {
  id: true,
  employeeId: true,
  startAt: true,
  endAt: true,
  reason: true,
} as const;

function notFound() {
  return new AppError("Bloqueio não encontrado", 404);
}

export const timeBlockRepository = {
  list(filter: ListTimeBlocksFilter) {
    return prisma.timeBlock.findMany({
      where: {
        businessId: getBusinessId(),
        ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
        ...(filter.from ? { endAt: { gt: filter.from } } : {}),
        ...(filter.to ? { startAt: { lt: filter.to } } : {}),
      },
      orderBy: { startAt: "asc" },
      select: timeBlockFields,
    });
  },

  findById(id: string) {
    return prisma.timeBlock.findFirst({
      where: { id, businessId: getBusinessId() },
      select: timeBlockFields,
    });
  },

  create(data: CreateTimeBlockInput) {
    return prisma.timeBlock.create({
      data: { ...data, businessId: getBusinessId() },
      select: timeBlockFields,
    });
  },

  async update(id: string, data: UpdateTimeBlockInput) {
    const [timeBlock] = await prisma.timeBlock.updateManyAndReturn({
      where: { id, businessId: getBusinessId() },
      data,
      select: timeBlockFields,
    });

    if (!timeBlock) {
      throw notFound();
    }

    return timeBlock;
  },

  async delete(id: string) {
    const { count } = await prisma.timeBlock.deleteMany({
      where: { id, businessId: getBusinessId() },
    });

    if (!count) {
      throw notFound();
    }
  },
};
