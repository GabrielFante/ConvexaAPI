import { AppError } from "../../shared/errors/AppError";
import { buildPage, type Pagination } from "../../shared/validation/pagination";
import { serviceRepository } from "./service.repository";
import type { CreateServiceInput, UpdateServiceInput } from "./service.schema";

async function getOwnedOrFail(id: string) {
  const service = await serviceRepository.findById(id);

  if (!service) {
    throw new AppError("Serviço não encontrado", 404);
  }

  return service;
}

export const serviceService = {
  async list(pagination: Pagination) {
    const { data, total } = await serviceRepository.list(pagination);
    return buildPage(data, total, pagination);
  },

  get(id: string) {
    return getOwnedOrFail(id);
  },

  create(data: CreateServiceInput) {
    return serviceRepository.create(data);
  },

  async update(id: string, data: UpdateServiceInput) {
    await getOwnedOrFail(id);
    return serviceRepository.update(id, data);
  },

  async delete(id: string) {
    await getOwnedOrFail(id);
    await serviceRepository.delete(id);
  },
};
