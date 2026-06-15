import { AppError } from "../../shared/errors/AppError";
import { customerRepository } from "./customer.repository";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
} from "./customer.schema";

async function getOwnedOrFail(id: string) {
  const customer = await customerRepository.findById(id);

  if (!customer) {
    throw new AppError("Cliente não encontrado", 404);
  }

  return customer;
}

export const customerService = {
  list() {
    return customerRepository.list();
  },

  get(id: string) {
    return getOwnedOrFail(id);
  },

  create(data: CreateCustomerInput) {
    return customerRepository.create(data);
  },

  async update(id: string, data: UpdateCustomerInput) {
    await getOwnedOrFail(id);
    return customerRepository.update(id, data);
  },

  async delete(id: string) {
    await getOwnedOrFail(id);
    await customerRepository.delete(id);
  },
};
