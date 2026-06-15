import { AppError } from "../../shared/errors/AppError";
import { employeeService } from "../employee/employee.service";
import { businessRepository } from "./business.repository";
import type {
  BusinessHourInput,
  CreateBusinessInput,
  CreateClosedDayInput,
  CreateVacationInput,
  UpdateBusinessInput,
} from "./business.schema";

async function getCurrentOrFail() {
  const business = await businessRepository.findCurrent();

  if (!business) {
    throw new AppError("Empresa não encontrada", 404);
  }

  return business;
}

export const businessService = {
  create(data: CreateBusinessInput) {
    return businessRepository.create(data);
  },

  get() {
    return getCurrentOrFail();
  },

  async update(data: UpdateBusinessInput) {
    await getCurrentOrFail();
    return businessRepository.update(data);
  },

  async delete() {
    await getCurrentOrFail();
    await businessRepository.delete();
  },

  setHours(hours: BusinessHourInput[]) {
    return businessRepository.setHours(hours);
  },

  listClosedDays() {
    return businessRepository.listClosedDays();
  },

  addClosedDay(data: CreateClosedDayInput) {
    return businessRepository.addClosedDay(data);
  },

  async deleteClosedDay(id: string) {
    const { count } = await businessRepository.deleteClosedDay(id);

    if (count === 0) {
      throw new AppError("Dia fechado não encontrado", 404);
    }
  },

  listVacations() {
    return businessRepository.listVacations();
  },

  async addVacation(data: CreateVacationInput) {
    if (data.employeeId) {
      await employeeService.get(data.employeeId);
    }
    return businessRepository.addVacation(data);
  },

  async deleteVacation(id: string) {
    const { count } = await businessRepository.deleteVacation(id);

    if (count === 0) {
      throw new AppError("Período de férias não encontrado", 404);
    }
  },
};
