import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/AppError";
import { getBusinessId } from "../../shared/tenant/tenant-context";
import {
  toPrismaPage,
  type Pagination,
} from "../../shared/validation/pagination";
import type { CreateServiceInput, UpdateServiceInput } from "./service.schema";

const serviceFields = {
  id: true,
  name: true,
  durationMinutes: true,
  priceCents: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

function notFound() {
  return new AppError("Serviço não encontrado", 404);
}

export const serviceRepository = {
  async list(pagination: Pagination) {
    const where = { businessId: getBusinessId() };

    const [data, total] = await prisma.$transaction([
      prisma.service.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: serviceFields,
        ...toPrismaPage(pagination),
      }),
      prisma.service.count({ where }),
    ]);

    return { data, total };
  },

  findById(id: string) {
    return prisma.service.findFirst({
      where: { id, businessId: getBusinessId() },
      select: serviceFields,
    });
  },

  create(data: CreateServiceInput) {
    return prisma.service.create({
      data: { ...data, businessId: getBusinessId() },
      select: serviceFields,
    });
  },

  async update(id: string, data: UpdateServiceInput) {
    const [service] = await prisma.service.updateManyAndReturn({
      where: { id, businessId: getBusinessId() },
      data,
      select: serviceFields,
    });

    if (!service) {
      throw notFound();
    }

    return service;
  },

  async delete(id: string) {
    const { count } = await prisma.service.deleteMany({
      where: { id, businessId: getBusinessId() },
    });

    if (!count) {
      throw notFound();
    }
  },
};
