import { describe, it, expect, beforeEach, vi } from "vitest";
import { runWithTenant } from "../shared/tenant/tenant-context";
import { serviceRepository } from "./service/service.repository";
import { customerRepository } from "./customer/customer.repository";
import { employeeRepository } from "./employee/employee.repository";
import { timeBlockRepository } from "./timeblock/timeblock.repository";
import { schedulingRepository } from "./scheduling/scheduling.repository";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PAGINATION = { page: 1, perPage: 20 };
const ID = "22222222-2222-4222-8222-222222222222";

type Args = { select?: Record<string, unknown> };

const db = vi.hoisted(() => {
  const id = "22222222-2222-4222-8222-222222222222";
  const calls: { model: string; method: string; args: Args }[] = [];

  const record =
    (model: string, method: string, result: unknown) => (args: Args) => {
      calls.push({ model, method, args });
      return Promise.resolve(result);
    };

  const model = (name: string) => ({
    findMany: vi.fn(record(name, "findMany", [{ id }])),
    findFirst: vi.fn(record(name, "findFirst", { id })),
    create: vi.fn(record(name, "create", { id })),
    upsert: vi.fn(record(name, "upsert", { id })),
    updateMany: vi.fn(record(name, "updateMany", { count: 1 })),
    updateManyAndReturn: vi.fn(record(name, "updateManyAndReturn", [{ id }])),
    deleteMany: vi.fn(record(name, "deleteMany", { count: 1 })),
    count: vi.fn(record(name, "count", 1)),
  });

  const prisma = {
    service: model("service"),
    customer: model("customer"),
    employee: model("employee"),
    timeBlock: model("timeBlock"),
    appointment: model("appointment"),
    business: model("business"),
    employeeService: model("employeeService"),
    employeeHours: model("employeeHours"),
    $transaction: vi.fn((run: unknown) =>
      typeof run === "function"
        ? (run as (tx: unknown) => unknown)(prisma)
        : Promise.all(run as unknown[]),
    ),
  };

  return {
    prisma,
    calls: () => calls,
    reset: () => {
      calls.length = 0;
    },
  };
});

vi.mock("../shared/database/prisma", () => ({ prisma: db.prisma }));

beforeEach(() => {
  db.reset();
});

function selectsOf(model: string): Record<string, unknown>[] {
  return db
    .calls()
    .filter((call) => call.model === model && call.method !== "count")
    .map((call) => call.args.select ?? {});
}

function expectEveryCallSelects(model: string, fields: string[]) {
  const selects = selectsOf(model);

  expect(selects.length).toBeGreaterThan(0);

  for (const select of selects) {
    expect(Object.keys(select).sort()).toEqual([...fields].sort());
  }
}

const SERVICE_FIELDS = [
  "id",
  "name",
  "durationMinutes",
  "priceCents",
  "active",
  "createdAt",
  "updatedAt",
];

const CUSTOMER_FIELDS = [
  "id",
  "name",
  "phone",
  "notes",
  "createdAt",
  "updatedAt",
];

const EMPLOYEE_FIELDS = [
  "id",
  "name",
  "active",
  "createdAt",
  "updatedAt",
  "services",
  "hours",
];

const TIME_BLOCK_FIELDS = ["id", "employeeId", "startAt", "endAt", "reason"];

const APPOINTMENT_FIELDS = [
  "id",
  "customerId",
  "employeeId",
  "serviceId",
  "startAt",
  "endAt",
  "status",
  "priceCents",
  "durationMinutes",
  "notes",
  "createdAt",
  "updatedAt",
  "customer",
  "employee",
  "service",
];

describe("allowlist de select — nenhum model do Prisma vai cru para o HTTP", () => {
  it("service usa a allowlist em toda leitura e escrita", async () => {
    await runWithTenant(TENANT, async () => {
      await serviceRepository.list(PAGINATION);
      await serviceRepository.findById(ID);
      await serviceRepository.create({
        name: "Corte",
        durationMinutes: 30,
        priceCents: 5000,
      });
      await serviceRepository.update(ID, { name: "Corte novo" });
    });

    expectEveryCallSelects("service", SERVICE_FIELDS);
  });

  it("customer usa a allowlist em toda leitura e escrita", async () => {
    await runWithTenant(TENANT, async () => {
      await customerRepository.list(PAGINATION);
      await customerRepository.findById(ID);
      await customerRepository.create({ name: "Ana", phone: "5511900000000" });
      await customerRepository.upsertByPhone("5511900000000", "Ana");
      await customerRepository.update(ID, { name: "Ana Maria" });
    });

    expectEveryCallSelects("customer", CUSTOMER_FIELDS);
  });

  it("employee usa a allowlist e mantem os selects aninhados", async () => {
    await runWithTenant(TENANT, async () => {
      await employeeRepository.list(PAGINATION);
      await employeeRepository.findById(ID);
      await employeeRepository.create({ name: "Joao", active: true });
    });

    expectEveryCallSelects("employee", EMPLOYEE_FIELDS);

    for (const select of selectsOf("employee")) {
      expect(select.services).toEqual({ select: { serviceId: true } });
      expect(select.hours).toEqual({
        select: { id: true, dayOfWeek: true, startsAt: true, endsAt: true },
      });
    }
  });

  it("timeBlock usa a allowlist em toda leitura e escrita", async () => {
    await runWithTenant(TENANT, async () => {
      await timeBlockRepository.list({});
      await timeBlockRepository.create({
        startAt: new Date("2026-10-01T12:00:00.000Z"),
        endAt: new Date("2026-10-01T13:00:00.000Z"),
      });
    });

    expectEveryCallSelects("timeBlock", TIME_BLOCK_FIELDS);
  });

  it("appointment usa a allowlist e nunca devolve o businessId", async () => {
    await runWithTenant(TENANT, async () => {
      await schedulingRepository.list({});
      await schedulingRepository.findById(ID);
      await schedulingRepository.updateStatus(ID, "CANCELLED");
    });

    const selects = selectsOf("appointment");

    expect(selects.length).toBe(3);

    for (const select of selects) {
      expect(Object.keys(select).sort()).toEqual(
        [...APPOINTMENT_FIELDS].sort(),
      );
      expect(select.businessId).toBeUndefined();
      expect(select.customer).toEqual({
        select: { id: true, name: true, phone: true },
      });
    }
  });
});
