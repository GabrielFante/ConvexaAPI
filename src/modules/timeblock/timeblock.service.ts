import { employeeService } from "../employee/employee.service";
import { timeBlockRepository } from "./timeblock.repository";
import type {
  CreateTimeBlockInput,
  ListTimeBlocksFilter,
} from "./timeblock.schema";

export const timeBlockService = {
  list(filter: ListTimeBlocksFilter) {
    return timeBlockRepository.list(filter);
  },

  async create(data: CreateTimeBlockInput) {
    if (data.employeeId) {
      await employeeService.get(data.employeeId);
    }
    return timeBlockRepository.create(data);
  },

  delete(id: string) {
    return timeBlockRepository.delete(id);
  },
};
