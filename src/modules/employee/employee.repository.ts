import type { Prisma } from "@prisma/client";
import { prisma } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/AppError";
import { getBusinessId } from "../../shared/tenant/tenant-context";
import { toPrismaPage } from "../../shared/validation/pagination";
import type {
  CreateEmployeeInput,
  EmployeeHourInput,
  ListEmployeeQuery,
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

async function ownedServiceIds(
  tx: Prisma.TransactionClient,
  serviceIds: string[],
  businessId: string,
): Promise<string[]> {
  const unique = [...new Set(serviceIds)];

  if (!unique.length) {
    return unique;
  }

  const owned = await tx.service.count({
    where: { id: { in: unique }, businessId },
  });

  if (owned !== unique.length) {
    throw new AppError("Serviço não encontrado", 404);
  }

  return unique;
}

async function findScopedOrFail(id: string) {
  const employee = await findScoped(id);

  if (!employee) {
    throw notFound();
  }

  return employee;
}

export const employeeRepository = {
  async list(query: ListEmployeeQuery) {
    const where = {
      businessId: getBusinessId(),
      ...(query.includeInactive ? {} : { active: true }),
    };

    const [data, total] = await prisma.$transaction([
      prisma.employee.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: employeeFields,
        ...toPrismaPage(query),
      }),
      prisma.employee.count({ where }),
    ]);

    return { data, total };
  },

  findById(id: string) {
    return findScoped(id);
  },

  create(data: CreateEmployeeInput) {
    const businessId = getBusinessId();

    return prisma.$transaction(async (tx) => {
      const serviceIds = await ownedServiceIds(
        tx,
        data.serviceIds ?? [],
        businessId,
      );

      return tx.employee.create({
        data: {
          businessId,
          name: data.name,
          active: data.active,
          services: serviceIds.length
            ? { create: serviceIds.map((serviceId) => ({ serviceId })) }
            : undefined,
          hours: data.hours?.length ? { create: data.hours } : undefined,
        },
        select: employeeFields,
      });
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

  async deactivate(id: string) {
    const { count } = await prisma.employee.updateMany({
      where: { id, businessId: getBusinessId() },
      data: { active: false },
    });

    if (!count) {
      throw notFound();
    }
  },

  async setServices(id: string, serviceIds: string[]) {
    const businessId = getBusinessId();
    await prisma.$transaction(async (tx) => {
      await assertOwned(tx, id, businessId);
      const owned = await ownedServiceIds(tx, serviceIds, businessId);
      await tx.employeeService.deleteMany({
        where: { employeeId: id, employee: { businessId } },
      });
      if (owned.length) {
        await tx.employeeService.createMany({
          data: owned.map((serviceId) => ({ employeeId: id, serviceId })),
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
