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

  const state = { appointments: [] as Appointment[] };

  const client = {
    appointment: {
      findFirst: vi.fn(() => Promise.resolve(null)),
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
      schedulingRepository.reschedule(APPOINTMENT_OF_B, {
        employeeId: "emp-do-b",
        startAt: NEW_START,
        endAt: NEW_END,
      }),
    );

    expect(appointment?.startAt).toEqual(NEW_START);
  });

  it("não reagenda agendamento de outro tenant e responde 404", async () => {
    const attempt = runWithTenant(TENANT_A, () =>
      schedulingRepository.reschedule(APPOINTMENT_OF_B, {
        employeeId: "emp-do-b",
        startAt: NEW_START,
        endAt: NEW_END,
      }),
    );

    await expect(attempt).rejects.toMatchObject({
      statusCode: 404,
      message: "Agendamento não encontrado",
    });
    expect(db.state.appointments[0]?.startAt).toEqual(START);
  });
});
