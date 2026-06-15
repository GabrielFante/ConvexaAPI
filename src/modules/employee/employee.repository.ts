import { prisma } from "../../shared/database/prisma";
import { getBusinessId } from "../../shared/tenant/tenant-context";
import type {
  CreateEmployeeInput,
  EmployeeHourInput,
  UpdateEmployeeInput,
} from "./employee.schema";

const employeeInclude = {
  services: { select: { serviceId: true } },
  hours: true,
} as const;

function findScoped(id: string) {
  return prisma.employee.findFirst({
    where: { id, businessId: getBusinessId() },
    include: employeeInclude,
  });
}

export const employeeRepository = {
  list() {
    return prisma.employee.findMany({
      where: { businessId: getBusinessId() },
      orderBy: { createdAt: "desc" },
      include: employeeInclude,
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
      include: employeeInclude,
    });
  },

  update(id: string, data: UpdateEmployeeInput) {
    return prisma.employee.update({
      where: { id },
      data,
      include: employeeInclude,
    });
  },

  delete(id: string) {
    return prisma.employee.delete({ where: { id } });
  },

  async setServices(id: string, serviceIds: string[]) {
    await prisma.$transaction(async (tx) => {
      await tx.employeeService.deleteMany({ where: { employeeId: id } });
      if (serviceIds.length) {
        await tx.employeeService.createMany({
          data: serviceIds.map((serviceId) => ({ employeeId: id, serviceId })),
        });
      }
    });
    return findScoped(id);
  },

  async setHours(id: string, hours: EmployeeHourInput[]) {
    await prisma.$transaction(async (tx) => {
      await tx.employeeHours.deleteMany({ where: { employeeId: id } });
      if (hours.length) {
        await tx.employeeHours.createMany({
          data: hours.map((hour) => ({ ...hour, employeeId: id })),
        });
      }
    });
    return findScoped(id);
  },
};
