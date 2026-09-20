import { describe, it, expect, beforeEach, vi } from "vitest";
import { runWithTenant } from "../shared/tenant/tenant-context";
import { serviceRepository } from "./service/service.repository";
import { listServiceQuerySchema } from "./service/service.schema";
import { employeeRepository } from "./employee/employee.repository";
import { listEmployeeQuerySchema } from "./employee/employee.schema";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";

type Where = Record<string, unknown>;
type Args = { where?: Where; data?: Record<string, unknown> };

const db = vi.hoisted(() => {
  const calls: { model: string; method: string; args: Args }[] = [];

  const record =
    (model: string, method: string, result: unknown) => (args: Args) => {
      calls.push({ model, method, args });
      return Promise.resolve(result);
    };

  const model = (name: string) => ({
    findMany: vi.fn(record(name, "findMany", [])),
    findFirst: vi.fn(record(name, "findFirst", { id: "x" })),
    updateMany: vi.fn(record(name, "updateMany", { count: 1 })),
    count: vi.fn(record(name, "count", 0)),
  });

  const prisma = {
    service: model("service"),
    employee: model("employee"),
    $transaction: vi.fn((run: unknown) =>
      typeof run === "function"
        ? (run as (tx: unknown) => unknown)(prisma)
        : Promise.all(run as unknown[]),
    ),
  };

  return {
    prisma,
    reset: () => calls.splice(0, calls.length),
    whereOf(model: string, method: string) {
      return calls.find(
        (call) => call.model === model && call.method === method,
      )?.args.where;
    },
    callOf(model: string, method: string) {
      return calls.find(
        (call) => call.model === model && call.method === method,
      )?.args;
    },
  };
});

vi.mock("../shared/database/prisma", () => ({ prisma: db.prisma }));

beforeEach(() => {
  db.reset();
});

describe("soft delete — a listagem esconde o registro desativado", () => {
  it("filtra active na leitura e na contagem de serviços", async () => {
    await runWithTenant(TENANT, () =>
      serviceRepository.list({ page: 1, perPage: 20, includeInactive: false }),
    );

    expect(db.whereOf("service", "findMany")).toEqual({
      businessId: TENANT,
      active: true,
    });
    expect(db.whereOf("service", "count")).toEqual({
      businessId: TENANT,
      active: true,
    });
  });

  it("filtra active na leitura e na contagem de funcionários", async () => {
    await runWithTenant(TENANT, () =>
      employeeRepository.list({ page: 1, perPage: 20, includeInactive: false }),
    );

    expect(db.whereOf("employee", "findMany")).toEqual({
      businessId: TENANT,
      active: true,
    });
    expect(db.whereOf("employee", "count")).toEqual({
      businessId: TENANT,
      active: true,
    });
  });

  it("devolve inativo quando o painel pede includeInactive, sem perder o tenant", async () => {
    await runWithTenant(TENANT, () =>
      serviceRepository.list({ page: 1, perPage: 20, includeInactive: true }),
    );

    expect(db.whereOf("service", "findMany")).toEqual({ businessId: TENANT });
  });
});

describe("soft delete — a remoção desativa em vez de apagar", () => {
  it("serviço: escreve active false com o tenant no filtro", async () => {
    await runWithTenant(TENANT, () => serviceRepository.deactivate(ID));

    expect(db.callOf("service", "updateMany")).toEqual({
      where: { id: ID, businessId: TENANT },
      data: { active: false },
    });
  });

  it("funcionário: escreve active false com o tenant no filtro", async () => {
    await runWithTenant(TENANT, () => employeeRepository.deactivate(ID));

    expect(db.callOf("employee", "updateMany")).toEqual({
      where: { id: ID, businessId: TENANT },
      data: { active: false },
    });
  });
});

describe("includeInactive — o texto da query string", () => {
  it('trata "false" como false, e nao como string verdadeira', () => {
    expect(
      listServiceQuerySchema.parse({ includeInactive: "false" }),
    ).toMatchObject({ includeInactive: false });
    expect(
      listEmployeeQuerySchema.parse({ includeInactive: "false" }),
    ).toMatchObject({ includeInactive: false });
  });

  it("omite o parametro e mantem o padrao de esconder inativo", () => {
    expect(listServiceQuerySchema.parse({})).toMatchObject({
      includeInactive: false,
    });
  });

  it('aceita "true" e recusa qualquer outro texto', () => {
    expect(
      listServiceQuerySchema.parse({ includeInactive: "true" }),
    ).toMatchObject({ includeInactive: true });
    expect(() =>
      listServiceQuerySchema.parse({ includeInactive: "1" }),
    ).toThrow();
  });
});
