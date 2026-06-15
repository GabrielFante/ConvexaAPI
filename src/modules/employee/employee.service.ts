import { AppError } from "../../shared/errors/AppError";
import { serviceService } from "../service/service.service";
import { employeeRepository } from "./employee.repository";
import type {
  CreateEmployeeInput,
  EmployeeHourInput,
  UpdateEmployeeInput,
} from "./employee.schema";

async function getOwnedOrFail(id: string) {
  const employee = await employeeRepository.findById(id);

  if (!employee) {
    throw new AppError("Funcionário não encontrado", 404);
  }

  return employee;
}

async function assertServicesOwned(serviceIds: string[]) {
  await Promise.all(
    serviceIds.map((serviceId) => serviceService.get(serviceId)),
  );
}

export const employeeService = {
  list() {
    return employeeRepository.list();
  },

  get(id: string) {
    return getOwnedOrFail(id);
  },

  async create(data: CreateEmployeeInput) {
    if (data.serviceIds?.length) {
      await assertServicesOwned(data.serviceIds);
    }
    return employeeRepository.create(data);
  },

  async update(id: string, data: UpdateEmployeeInput) {
    await getOwnedOrFail(id);
    return employeeRepository.update(id, data);
  },

  async setServices(id: string, serviceIds: string[]) {
    await getOwnedOrFail(id);
    await assertServicesOwned(serviceIds);
    return employeeRepository.setServices(id, serviceIds);
  },

  async setHours(id: string, hours: EmployeeHourInput[]) {
    await getOwnedOrFail(id);
    return employeeRepository.setHours(id, hours);
  },

  async delete(id: string) {
    await getOwnedOrFail(id);
    await employeeRepository.delete(id);
  },
};
