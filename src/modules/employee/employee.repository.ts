import type { Prisma } from "@prisma/client";
import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/AppError";
import { getBusinessId } from "../../shared/tenant/tenant-context";
import type {
  CreateEmployeeInput,
  EmployeeHourInput,
  UpdateEmployeeInput,
} from "./employee.schema";

const employeeFields = {
  id: true,
  name: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  services: { select: { serviceId: true } },
  hours: {
    select: { id: true, dayOfWeek: true, startsAt: true, endsAt: true },
  },
} as const;

function notFound() {
  return new AppError("Funcionário não encontrado", 404);
}

function findScoped(id: string) {
  return prisma.employee.findFirst({
    where: { id, businessId: getBusinessId() },
    select: employeeFields,
  });
}

async function assertOwned(
  tx: Prisma.TransactionClient,
  id: string,
  businessId: string,
) {
  const owned = await tx.employee.findFirst({
    where: { id, businessId },
    select: { id: true },
  });

  if (!owned) {
    throw notFound();
  }
}

async function findScopedOrFail(id: string) {
  const employee = await findScoped(id);

  if (!employee) {
    throw notFound();
  }

  return employee;
}

export const employeeRepository = {
  list() {
    return prisma.employee.findMany({
      where: { businessId: getBusinessId() },
      orderBy: { createdAt: "desc" },
      select: employeeFields,
    });
  },

  findById(id: string) {
    return findScoped(id);
  },

  create(data: CreateEmployeeInput) {
    return prisma.employee.create({
      data: {
        businessId: getBusinessId(),
        name: data.name,
        active: data.active,
        services: data.serviceIds?.length
          ? { create: data.serviceIds.map((serviceId) => ({ serviceId })) }
          : undefined,
        hours: data.hours?.length ? { create: data.hours } : undefined,
      },
      select: employeeFields,
    });
  },

  async update(id: string, data: UpdateEmployeeInput) {
    const { count } = await prisma.employee.updateMany({
      where: { id, businessId: getBusinessId() },
      data,
    });

    if (!count) {
      throw notFound();
    }

    return findScopedOrFail(id);
  },

  async delete(id: string) {
    const { count } = await prisma.employee.deleteMany({
      where: { id, businessId: getBusinessId() },
    });

    if (!count) {
      throw notFound();
    }
  },

  async setServices(id: string, serviceIds: string[]) {
    const businessId = getBusinessId();
    await prisma.$transaction(async (tx) => {
      await assertOwned(tx, id, businessId);
      await tx.employeeService.deleteMany({
        where: { employeeId: id, employee: { businessId } },
      });
      if (serviceIds.length) {
        await tx.employeeService.createMany({
          data: serviceIds.map((serviceId) => ({ employeeId: id, serviceId })),
        });
      }
    });
    return findScopedOrFail(id);
  },

  async setHours(id: string, hours: EmployeeHourInput[]) {
    const businessId = getBusinessId();
    await prisma.$transaction(async (tx) => {
      await assertOwned(tx, id, businessId);
      await tx.employeeHours.deleteMany({
        where: { employeeId: id, employee: { businessId } },
      });
      if (hours.length) {
        await tx.employeeHours.createMany({
          data: hours.map((hour) => ({ ...hour, employeeId: id })),
        });
      }
    });
    return findScopedOrFail(id);
  },
};
