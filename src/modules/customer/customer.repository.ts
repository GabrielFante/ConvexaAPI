import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/AppError";
import { getBusinessId } from "../../shared/tenant/tenant-context";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
} from "./customer.schema";

function notFound() {
  return new AppError("Cliente não encontrado", 404);
}

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

  async update(id: string, data: UpdateCustomerInput) {
    const [customer] = await prisma.customer.updateManyAndReturn({
      where: { id, businessId: getBusinessId() },
      data,
    });

    if (!customer) {
      throw notFound();
    }

    return customer;
  },

  async delete(id: string) {
    const { count } = await prisma.customer.deleteMany({
      where: { id, businessId: getBusinessId() },
    });

    if (!count) {
      throw notFound();
    }
  },
};
