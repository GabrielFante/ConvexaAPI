import { prisma } from "../../shared/database/prisma";
import { getBusinessId } from "../../shared/tenant/tenant-context";

export const customerRepository = {
  list() {
    return prisma.customer.findMany({
      where: { businessId: getBusinessId() },
      orderBy: { createdAt: "desc" },
    });
  },

  findById(id: string) {
    return prisma.customer.findFirst({
      where: { id, businessId: getBusinessId() },
    });
  },

  create(data: { name: string; phone: string; notes?: string }) {
    return prisma.customer.create({
      data: { ...data, businessId: getBusinessId() },
    });
  },
};
