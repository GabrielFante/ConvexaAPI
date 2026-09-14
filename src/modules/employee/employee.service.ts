import { AppError } from "../../shared/errors/AppError";
import { buildPage, type Pagination } from "../../shared/validation/pagination";
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

export const employeeService = {
  async list(pagination: Pagination) {
    const { data, total } = await employeeRepository.list(pagination);
    return buildPage(data, total, pagination);
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
    await employeeRepository.delete(id);
  },
};
