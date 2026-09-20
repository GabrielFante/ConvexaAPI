import { AppError } from "../../shared/errors/AppError";
import { buildPage } from "../../shared/validation/pagination";
import { employeeRepository } from "./employee.repository";
import type {
  CreateEmployeeInput,
  EmployeeHourInput,
  ListEmployeeQuery,
  UpdateEmployeeInput,
} from "./employee.schema";

async function getOwnedOrFail(id: string) {
  const employee = await employeeRepository.findById(id);

  if (!employee) {
    throw new AppError("Funcionário não encontrado", 404);
  }

  return employee;
}

export const employeeService = {
  async list(query: ListEmployeeQuery) {
    const { data, total } = await employeeRepository.list(query);
    return buildPage(data, total, query);
  },

  get(id: string) {
    return getOwnedOrFail(id);
  },

  create(data: CreateEmployeeInput) {
    return employeeRepository.create(data);
  },

  async update(id: string, data: UpdateEmployeeInput) {
    await getOwnedOrFail(id);
    return employeeRepository.update(id, data);
  },

  async setServices(id: string, serviceIds: string[]) {
    await getOwnedOrFail(id);
    return employeeRepository.setServices(id, serviceIds);
  },

  async setHours(id: string, hours: EmployeeHourInput[]) {
    await getOwnedOrFail(id);
    return employeeRepository.setHours(id, hours);
  },

  async delete(id: string) {
    await getOwnedOrFail(id);
    await employeeRepository.deactivate(id);
  },
};
