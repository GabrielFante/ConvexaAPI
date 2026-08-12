import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/AppError";
import { getBusinessId } from "../../shared/tenant/tenant-context";
import type {
  CreateTimeBlockInput,
  ListTimeBlocksFilter,
} from "./timeblock.schema";

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
    });
  },

  create(data: CreateTimeBlockInput) {
    return prisma.timeBlock.create({
      data: { ...data, businessId: getBusinessId() },
    });
  },

  async delete(id: string) {
    const { count } = await prisma.timeBlock.deleteMany({
      where: { id, businessId: getBusinessId() },
    });

    if (!count) {
      throw new AppError("Bloqueio não encontrado", 404);
    }
  },
};
