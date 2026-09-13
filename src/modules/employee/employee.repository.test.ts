import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "../../shared/errors/AppError";
import { runWithTenant } from "../../shared/tenant/tenant-context";
import { employeeRepository } from "./employee.repository";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_OF_B = "55555555-5555-4555-8555-555555555555";
const SERVICE_OF_A = "66666666-6666-4666-8666-666666666666";
const SERVICE_OF_B = "77777777-7777-4777-8777-777777777777";
const OTHER_SERVICE_OF_B = "88888888-8888-4888-8888-888888888888";

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

  type CatalogService = { id: string; businessId: string };

  const state = {
    employees: [] as Employee[],
    services: [] as EmployeeService[],
    hours: [] as EmployeeHour[],
    catalog: [] as CatalogService[],
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
    service: {
      count: vi.fn(
        (args: { where: { id: { in: string[] }; businessId: string } }) =>
          Promise.resolve(
            state.catalog.filter(
              (row) =>
                args.where.id.in.includes(row.id) &&
                row.businessId === args.where.businessId,
            ).length,
          ),
      ),
    },
    employee: {
      create: vi.fn(
        (args: {
          data: {
            businessId: string;
            name: string;
            services?: { create: { serviceId: string }[] };
          };
        }) => {
          const employee = {
            id: `emp-${state.employees.length + 1}`,
            businessId: args.data.businessId,
            name: args.data.name,
          };

          state.employees.push(employee);
          state.services.push(
            ...(args.data.services?.create ?? []).map((row) => ({
              employeeId: employee.id,
              serviceId: row.serviceId,
            })),
          );

          return Promise.resolve({ ...employee, services: [], hours: [] });
        },
      ),
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
      state.catalog = [
        { id: SERVICE_OF_A, businessId: TENANT_A },
        { id: SERVICE_OF_B, businessId: TENANT_B },
        { id: OTHER_SERVICE_OF_B, businessId: TENANT_B },
      ];
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
    [{ employeeId: EMPLOYEE_OF_B, serviceId: SERVICE_OF_B }],
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
      employeeRepository.setServices(EMPLOYEE_OF_B, [OTHER_SERVICE_OF_B]),
    );

    expect(employee.services).toEqual([{ serviceId: OTHER_SERVICE_OF_B }]);
  });

  it("não toca nos serviços de funcionário de outro tenant e responde 404", async () => {
    const attempt = runWithTenant(TENANT_A, () =>
      employeeRepository.setServices(EMPLOYEE_OF_B, [SERVICE_OF_A]),
    );

    await expect(attempt).rejects.toMatchObject({ statusCode: 404 });
    expect(db.state.services).toEqual([
      { employeeId: EMPLOYEE_OF_B, serviceId: SERVICE_OF_B },
    ]);
  });

  it("não liga o funcionário a serviço de outro tenant e mantém os vínculos", async () => {
    const attempt = runWithTenant(TENANT_B, () =>
      employeeRepository.setServices(EMPLOYEE_OF_B, [
        OTHER_SERVICE_OF_B,
        SERVICE_OF_A,
      ]),
    );

    await expect(attempt).rejects.toMatchObject({
      statusCode: 404,
      message: "Serviço não encontrado",
    });
    expect(db.state.services).toEqual([
      { employeeId: EMPLOYEE_OF_B, serviceId: SERVICE_OF_B },
    ]);
  });

  it("valida o dono dos serviços dentro da transação da escrita", async () => {
    await runWithTenant(TENANT_B, () =>
      employeeRepository.setServices(EMPLOYEE_OF_B, [OTHER_SERVICE_OF_B]),
    );

    expect(db.prisma.service.count).toHaveBeenCalledWith({
      where: { id: { in: [OTHER_SERVICE_OF_B] }, businessId: TENANT_B },
    });
  });

  it("aceita serviço repetido na lista sem acusar serviço alheio", async () => {
    const employee = await runWithTenant(TENANT_B, () =>
      employeeRepository.setServices(EMPLOYEE_OF_B, [
        OTHER_SERVICE_OF_B,
        OTHER_SERVICE_OF_B,
      ]),
    );

    expect(employee.services).toEqual([{ serviceId: OTHER_SERVICE_OF_B }]);
  });

  it("cria funcionário com serviços do próprio tenant", async () => {
    await runWithTenant(TENANT_B, () =>
      employeeRepository.create({
        name: "Novo",
        active: true,
        serviceIds: [SERVICE_OF_B],
      }),
    );

    expect(db.state.employees).toHaveLength(2);
    expect(db.state.services).toContainEqual({
      employeeId: "emp-2",
      serviceId: SERVICE_OF_B,
    });
  });

  it("não cria funcionário ligado a serviço de outro tenant", async () => {
    const attempt = runWithTenant(TENANT_B, () =>
      employeeRepository.create({
        name: "Invasor",
        active: true,
        serviceIds: [SERVICE_OF_A],
      }),
    );

    await expect(attempt).rejects.toMatchObject({
      statusCode: 404,
      message: "Serviço não encontrado",
    });
    expect(db.state.employees).toHaveLength(1);
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
