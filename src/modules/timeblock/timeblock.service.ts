import { AppError } from "../../shared/errors/AppError";
import { employeeService } from "../employee/employee.service";
import { timeBlockRepository } from "./timeblock.repository";
import {
  END_AFTER_START_MESSAGE,
  type CreateTimeBlockInput,
  type ListTimeBlocksFilter,
  type UpdateTimeBlockInput,
} from "./timeblock.schema";

async function getOwnedOrFail(id: string) {
  const timeBlock = await timeBlockRepository.findById(id);

  if (!timeBlock) {
    throw new AppError("Bloqueio não encontrado", 404);
  }

  return timeBlock;
}

export const timeBlockService = {
  list(filter: ListTimeBlocksFilter) {
    return timeBlockRepository.list(filter);
  },

  get(id: string) {
    return getOwnedOrFail(id);
  },

  async create(data: CreateTimeBlockInput) {
    if (data.employeeId) {
      await employeeService.get(data.employeeId);
    }
    return timeBlockRepository.create(data);
  },

  async update(id: string, data: UpdateTimeBlockInput) {
    const current = await getOwnedOrFail(id);

    if (data.employeeId) {
      await employeeService.get(data.employeeId);
    }

    const startAt = data.startAt ?? current.startAt;
    const endAt = data.endAt ?? current.endAt;

    if (startAt >= endAt) {
      throw new AppError(END_AFTER_START_MESSAGE, 400);
    }

    return timeBlockRepository.update(id, data);
  },

  delete(id: string) {
    return timeBlockRepository.delete(id);
  },
};
