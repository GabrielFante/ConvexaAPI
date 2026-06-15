import { AsyncLocalStorage } from "node:async_hooks";
import { AppError } from "../errors/AppError";

type TenantStore = {
  businessId: string;
};

const storage = new AsyncLocalStorage<TenantStore>();

export function runWithTenant<T>(businessId: string, fn: () => T): T {
  return storage.run({ businessId }, fn);
}

export function getBusinessId(): string {
  const store = storage.getStore();

  if (!store) {
    throw new AppError("Contexto de tenant ausente na requisição", 500);
  }

  return store.businessId;
}
