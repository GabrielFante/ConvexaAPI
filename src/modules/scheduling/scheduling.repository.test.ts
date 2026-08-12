import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "../../shared/errors/AppError";
import { runWithTenant } from "../../shared/tenant/tenant-context";
import { schedulingRepository } from "./scheduling.repository";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const APPOINTMENT_OF_B = "66666666-6666-4666-8666-666666666666";

const START = new Date("2026-08-12T13:00:00.000Z");
const END = new Date("2026-08-12T14:00:00.000Z");
const NEW_START = new Date("2026-08-12T17:00:00.000Z");
const NEW_END = new Date("2026-08-12T18:00:00.000Z");

const db = vi.hoisted(() => {
  type Appointment = {
    id: string;
    businessId: string;
    employeeId: string;
    status: string;
    startAt: Date;
    endAt: Date;
  };
  type ScopedWhere = { id: string; businessId: string };
  type ConflictWhere = {
    businessId: string;
    employeeId: string;
    status: { in: string[] };
    startAt: { lt: Date };
    endAt: { gt: Date };
    id?: { not: string };
  };

  const state = { appointments: [] as Appointment[] };

  const client = {
    appointment: {
      findFirst: vi.fn((args: { where: ConflictWhere }) =>
        Promise.resolve(
          state.appointments.find(
            (row) =>
              row.businessId === args.where.businessId &&
              row.employeeId === args.where.employeeId &&
              args.where.status.in.includes(row.status) &&
              row.id !== args.where.id?.not &&
              row.startAt.getTime() < args.where.startAt.lt.getTime() &&
              row.endAt.getTime() > args.where.endAt.gt.getTime(),
          ) ?? null,
        ),
      ),
      create: vi.fn(
        (args: {
          data: Omit<Appointment, "id" | "status"> & { status?: string };
        }) => {
          const created = {
            ...args.data,
            id: `apt-${state.appointments.length + 1}`,
            status: args.data.status ?? "SCHEDULED",
          };

          state.appointments.push(created);
          return Promise.resolve({ ...created });
        },
      ),
      updateManyAndReturn: vi.fn(
        (args: { where: ScopedWhere; data: Partial<Appointment> }) => {
          const appointment = state.appointments.find(
            (row) =>
              row.id === args.where.id &&
              row.businessId === args.where.businessId,
          );

          if (!appointment) {
            return Promise.resolve([]);
          }

          Object.assign(appointment, args.data);
          return Promise.resolve([{ ...appointment }]);
        },
      ),
    },
  };

  return {
    state,
    seed(appointments: Appointment[]) {
      state.appointments = appointments.map((row) => ({ ...row }));
    },
    prisma: {
      ...client,
      $transaction: vi.fn((fn: (tx: typeof client) => Promise<unknown>) =>
        fn(client),
      ),
    },
  };
});

vi.mock("../../shared/database/prisma", () => ({ prisma: db.prisma }));

beforeEach(() => {
  db.seed([
    {
      id: APPOINTMENT_OF_B,
      businessId: TENANT_B,
      employeeId: "emp-do-b",
      status: "SCHEDULED",
      startAt: START,
      endAt: END,
    },
  ]);
});

describe("schedulingRepository — escopo de tenant nas escritas", () => {
  it("cancela o agendamento do próprio tenant", async () => {
    const appointment = await runWithTenant(TENANT_B, () =>
      schedulingRepository.updateStatus(APPOINTMENT_OF_B, "CANCELLED"),
    );

    expect(appointment.status).toBe("CANCELLED");
  });

  it("não muda o status de agendamento de outro tenant e responde 404", async () => {
    const attempt = runWithTenant(TENANT_A, () =>
      schedulingRepository.updateStatus(APPOINTMENT_OF_B, "CANCELLED"),
    );

    await expect(attempt).rejects.toThrow(AppError);
    await expect(attempt).rejects.toMatchObject({
      statusCode: 404,
      message: "Agendamento não encontrado",
    });
    expect(db.state.appointments[0]?.status).toBe("SCHEDULED");
  });

  it("reagenda o agendamento do próprio tenant", async () => {
    const appointment = await runWithTenant(TENANT_B, () =>
      schedulingRepository.reschedule(
        APPOINTMENT_OF_B,
        {
          employeeId: "emp-do-b",
          startAt: NEW_START,
          endAt: NEW_END,
        },
        0,
      ),
    );

    expect(appointment?.startAt).toEqual(NEW_START);
  });

  it("não reagenda agendamento de outro tenant e responde 404", async () => {
    const attempt = runWithTenant(TENANT_A, () =>
      schedulingRepository.reschedule(
        APPOINTMENT_OF_B,
        {
          employeeId: "emp-do-b",
          startAt: NEW_START,
          endAt: NEW_END,
        },
        0,
      ),
    );

    await expect(attempt).rejects.toMatchObject({
      statusCode: 404,
      message: "Agendamento não encontrado",
    });
    expect(db.state.appointments[0]?.startAt).toEqual(START);
  });
});

describe("schedulingRepository — buffer no re-check da transação", () => {
  const write = {
    customerId: "cus-1",
    serviceId: "svc-1",
    employeeId: "emp-do-b",
    startAt: END,
    endAt: NEW_START,
    priceCents: 5000,
    durationMinutes: 60,
  };

  it("acusa conflito ao encostar em um agendamento existente quando há buffer", async () => {
    const created = await runWithTenant(TENANT_B, () =>
      schedulingRepository.create(write, 10),
    );

    expect(created).toBeNull();
    expect(db.state.appointments).toHaveLength(1);
  });

  it("aceita o encaixe imediatamente após o agendamento existente quando não há buffer", async () => {
    const created = await runWithTenant(TENANT_B, () =>
      schedulingRepository.create(write, 0),
    );

    expect(created).not.toBeNull();
    expect(db.state.appointments).toHaveLength(2);
  });

  it("acusa conflito ao reagendar para um horário colado em outro agendamento", async () => {
    db.state.appointments.push({
      id: "outro-agendamento",
      businessId: TENANT_B,
      employeeId: "emp-do-b",
      status: "SCHEDULED",
      startAt: NEW_END,
      endAt: new Date(NEW_END.getTime() + 60 * 60 * 1000),
    });

    const rescheduled = await runWithTenant(TENANT_B, () =>
      schedulingRepository.reschedule(
        APPOINTMENT_OF_B,
        { employeeId: "emp-do-b", startAt: NEW_START, endAt: NEW_END },
        10,
      ),
    );

    expect(rescheduled).toBeNull();
    expect(db.state.appointments[0]?.startAt).toEqual(START);
  });
});
