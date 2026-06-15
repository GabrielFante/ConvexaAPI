import { prisma } from "../../shared/database/prisma";
import { getBusinessId } from "../../shared/tenant/tenant-context";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
} from "./customer.schema";

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

  create(data: CreateCustomerInput) {
    return prisma.customer.create({
      data: { ...data, businessId: getBusinessId() },
    });
  },

  update(id: string, data: UpdateCustomerInput) {
    return prisma.customer.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.customer.delete({ where: { id } });
  },
};
