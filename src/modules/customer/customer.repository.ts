import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/AppError";
import { getBusinessId } from "../../shared/tenant/tenant-context";
import {
  toPrismaPage,
  type Pagination,
} from "../../shared/validation/pagination";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
} from "./customer.schema";

const customerFields = {
  id: true,
  name: true,
  phone: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

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
  async list(pagination: Pagination) {
    const where = { businessId: getBusinessId() };

    const [data, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: customerFields,
        ...toPrismaPage(pagination),
      }),
      prisma.customer.count({ where }),
    ]);

    return { data, total };
  },

  findById(id: string) {
    return prisma.customer.findFirst({
      where: { id, businessId: getBusinessId() },
      select: customerFields,
    });
  },

  create(data: CreateCustomerInput) {
    return prisma.customer.create({
      data: { ...data, businessId: getBusinessId() },
      select: customerFields,
    });
  },

  async upsertByPhone(phone: string, name: string) {
    const businessId = getBusinessId();

    try {
      return await prisma.customer.upsert({
        where: { businessId_phone: { businessId, phone } },
        create: { businessId, phone, name },
        update: {},
        select: customerFields,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const concurrent = await prisma.customer.findFirst({
        where: { businessId, phone },
        select: customerFields,
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
      select: customerFields,
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
