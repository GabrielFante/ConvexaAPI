import { AsyncLocalStorage } from "node:async_hooks";
import type { AgentPrincipal } from "../auth/agent-token";
import type { AuthUser } from "../auth/jwt";
import { AppError } from "../errors/AppError";

type TenantStore = {
  businessId: string;
  user?: AuthUser;
  agent?: AgentPrincipal;
};

const storage = new AsyncLocalStorage<TenantStore>();

export function runWithTenant<T>(businessId: string, fn: () => T): T {
  return storage.run({ businessId }, fn);
}

export function runWithAuth<T>(user: AuthUser, fn: () => T): T {
  return storage.run({ businessId: user.businessId, user }, fn);
}

export function runWithAgent<T>(agent: AgentPrincipal, fn: () => T): T {
  return storage.run({ businessId: agent.businessId, agent }, fn);
}

export function getCurrentAgent(): AgentPrincipal {
  const store = storage.getStore();

  if (!store?.agent) {
    throw new AppError("Contexto do agente ausente na requisição", 500);
  }

  return store.agent;
}

export function getBusinessId(): string {
  const store = storage.getStore();

  if (!store) {
    throw new AppError("Contexto de tenant ausente na requisição", 500);
  }

  return store.businessId;
}

export function getCurrentUser(): AuthUser {
  const store = storage.getStore();

  if (!store?.user) {
    throw new AppError("Contexto de autenticação ausente na requisição", 500);
  }

  return store.user;
}
