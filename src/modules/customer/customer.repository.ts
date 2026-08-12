import { Prisma } from "@prisma/client";
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

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
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

  async upsertByPhone(phone: string, name: string) {
    const businessId = getBusinessId();

    try {
      return await prisma.customer.upsert({
        where: { businessId_phone: { businessId, phone } },
        create: { businessId, phone, name },
        update: {},
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const concurrent = await prisma.customer.findFirst({
        where: { businessId, phone },
      });

      if (!concurrent) {
        throw error;
      }

      return concurrent;
    }
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
