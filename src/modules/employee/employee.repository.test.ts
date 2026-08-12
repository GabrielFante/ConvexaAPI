import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "../../shared/errors/AppError";
import { runWithTenant } from "../../shared/tenant/tenant-context";
import { employeeRepository } from "./employee.repository";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_OF_B = "55555555-5555-4555-8555-555555555555";

const db = vi.hoisted(() => {
  type Employee = { id: string; businessId: string; name: string };
  type EmployeeService = { employeeId: string; serviceId: string };
  type EmployeeHour = {
    employeeId: string;
    dayOfWeek: number;
    startsAt: number;
    endsAt: number;
  };
  type ScopedWhere = { id: string; businessId: string };
  type RelationWhere = {
    employeeId: string;
    employee: { businessId: string };
  };

  const state = {
    employees: [] as Employee[],
    services: [] as EmployeeService[],
    hours: [] as EmployeeHour[],
  };

  const findEmployee = (where: ScopedWhere) =>
    state.employees.find(
      (employee) =>
        employee.id === where.id && employee.businessId === where.businessId,
    );

  const ownedBy = (where: RelationWhere) => (row: { employeeId: string }) => {
    const employee = state.employees.find(
      (candidate) => candidate.id === row.employeeId,
    );

    return (
      row.employeeId === where.employeeId &&
      employee?.businessId === where.employee.businessId
    );
  };

  const deleteRelation = <T extends { employeeId: string }>(
    rows: T[],
    where: RelationWhere,
  ) => {
    const keep = rows.filter((row) => !ownedBy(where)(row));
    const count = rows.length - keep.length;
    rows.length = 0;
    rows.push(...keep);
    return Promise.resolve({ count });
  };

  const client = {
    employee: {
      findFirst: vi.fn((args: { where: ScopedWhere }) => {
        const employee = findEmployee(args.where);

        if (!employee) {
          return Promise.resolve(null);
        }

        return Promise.resolve({
          ...employee,
          services: state.services
            .filter((row) => row.employeeId === employee.id)
            .map((row) => ({ serviceId: row.serviceId })),
          hours: state.hours.filter((row) => row.employeeId === employee.id),
        });
      }),
      updateMany: vi.fn(
        (args: { where: ScopedWhere; data: Partial<Employee> }) => {
          const employee = findEmployee(args.where);

          if (!employee) {
            return Promise.resolve({ count: 0 });
          }

          Object.assign(employee, args.data);
          return Promise.resolve({ count: 1 });
        },
      ),
      deleteMany: vi.fn((args: { where: ScopedWhere }) => {
        const employee = findEmployee(args.where);

        if (!employee) {
          return Promise.resolve({ count: 0 });
        }

        state.employees = state.employees.filter((row) => row !== employee);
        return Promise.resolve({ count: 1 });
      }),
    },
    employeeService: {
      deleteMany: vi.fn((args: { where: RelationWhere }) =>
        deleteRelation(state.services, args.where),
      ),
      createMany: vi.fn((args: { data: EmployeeService[] }) => {
        state.services.push(...args.data);
        return Promise.resolve({ count: args.data.length });
      }),
    },
    employeeHours: {
      deleteMany: vi.fn((args: { where: RelationWhere }) =>
        deleteRelation(state.hours, args.where),
      ),
      createMany: vi.fn((args: { data: EmployeeHour[] }) => {
        state.hours.push(...args.data);
        return Promise.resolve({ count: args.data.length });
      }),
    },
  };

  return {
    state,
    seed(employees: Employee[], services: EmployeeService[]) {
      state.employees = employees.map((row) => ({ ...row }));
      state.services = services.map((row) => ({ ...row }));
      state.hours = [];
    },
    prisma: {
      ...client,
      $transaction: vi.fn(async (fn: (tx: typeof client) => Promise<void>) => {
        const snapshot = {
          employees: state.employees.map((row) => ({ ...row })),
          services: state.services.map((row) => ({ ...row })),
          hours: state.hours.map((row) => ({ ...row })),
        };

        try {
          return await fn(client);
        } catch (error) {
          state.employees = snapshot.employees;
          state.services = snapshot.services;
          state.hours = snapshot.hours;
          throw error;
        }
      }),
    },
  };
});

vi.mock("../../shared/database/prisma", () => ({ prisma: db.prisma }));

beforeEach(() => {
  db.seed(
    [{ id: EMPLOYEE_OF_B, businessId: TENANT_B, name: "Funcionário do B" }],
    [{ employeeId: EMPLOYEE_OF_B, serviceId: "svc-do-b" }],
  );
});

describe("employeeRepository — escopo de tenant nas escritas", () => {
  it("atualiza o funcionário do próprio tenant", async () => {
    const employee = await runWithTenant(TENANT_B, () =>
      employeeRepository.update(EMPLOYEE_OF_B, { name: "Nome novo" }),
    );

    expect(employee.name).toBe("Nome novo");
  });

  it("não atualiza funcionário de outro tenant e responde 404", async () => {
    const attempt = runWithTenant(TENANT_A, () =>
      employeeRepository.update(EMPLOYEE_OF_B, { name: "Invadido" }),
    );

    await expect(attempt).rejects.toThrow(AppError);
    await expect(attempt).rejects.toMatchObject({
      statusCode: 404,
      message: "Funcionário não encontrado",
    });
    expect(db.state.employees[0]?.name).toBe("Funcionário do B");
  });

  it("não remove funcionário de outro tenant e responde 404", async () => {
    const attempt = runWithTenant(TENANT_A, () =>
      employeeRepository.delete(EMPLOYEE_OF_B),
    );

    await expect(attempt).rejects.toMatchObject({ statusCode: 404 });
    expect(db.state.employees).toHaveLength(1);
  });

  it("substitui os serviços do funcionário do próprio tenant", async () => {
    const employee = await runWithTenant(TENANT_B, () =>
      employeeRepository.setServices(EMPLOYEE_OF_B, ["svc-novo"]),
    );

    expect(employee.services).toEqual([{ serviceId: "svc-novo" }]);
  });

  it("não toca nos serviços de funcionário de outro tenant e responde 404", async () => {
    const attempt = runWithTenant(TENANT_A, () =>
      employeeRepository.setServices(EMPLOYEE_OF_B, ["svc-invasor"]),
    );

    await expect(attempt).rejects.toMatchObject({ statusCode: 404 });
    expect(db.state.services).toEqual([
      { employeeId: EMPLOYEE_OF_B, serviceId: "svc-do-b" },
    ]);
  });

  it("não toca na jornada de funcionário de outro tenant e responde 404", async () => {
    const attempt = runWithTenant(TENANT_A, () =>
      employeeRepository.setHours(EMPLOYEE_OF_B, [
        { dayOfWeek: 1, startsAt: 540, endsAt: 1080 },
      ]),
    );

    await expect(attempt).rejects.toMatchObject({ statusCode: 404 });
    expect(db.state.hours).toHaveLength(0);
  });
});
