import { prisma } from "../../shared/database/prisma";
import { getBusinessId } from "../../shared/tenant/tenant-context";
import type { CreateServiceInput, UpdateServiceInput } from "./service.schema";

export const serviceRepository = {
  list() {
    return prisma.service.findMany({
      where: { businessId: getBusinessId() },
      orderBy: { createdAt: "desc" },
    });
  },

  findById(id: string) {
    return prisma.service.findFirst({
      where: { id, businessId: getBusinessId() },
    });
  },

  create(data: CreateServiceInput) {
    return prisma.service.create({
      data: { ...data, businessId: getBusinessId() },
    });
  },

  update(id: string, data: UpdateServiceInput) {
    return prisma.service.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.service.delete({ where: { id } });
  },
};
