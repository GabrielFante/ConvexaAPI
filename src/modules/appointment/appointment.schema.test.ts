import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  createAppointmentSchema,
  listAppointmentsSchema,
  rescheduleAppointmentSchema,
} from "./appointment.schema";

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const SERVICE = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE = "33333333-3333-4333-8333-333333333333";

const input = {
  customerId: CUSTOMER,
  serviceId: SERVICE,
  employeeId: EMPLOYEE,
  startAt: "2026-12-25T13:00:00.000Z",
};

function pathsOf(schema: z.ZodType, data: unknown): string[] {
  const result = schema.safeParse(data);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
}

function issuePaths(data: unknown): string[] {
  return pathsOf(createAppointmentSchema, data);
}

function reschedulePaths(data: unknown): string[] {
  return pathsOf(rescheduleAppointmentSchema, data);
}

function listPaths(data: unknown): string[] {
  return pathsOf(listAppointmentsSchema, data);
}

describe("createAppointmentSchema", () => {
  it("converte startAt para Date", () => {
    const parsed = createAppointmentSchema.parse(input);

    expect(parsed.startAt).toEqual(new Date("2026-12-25T13:00:00.000Z"));
  });

  it("aceita entrada sem notes", () => {
    expect(createAppointmentSchema.parse(input).notes).toBeUndefined();
  });

  it("exige fuso explícito em startAt", () => {
    expect(issuePaths({ ...input, startAt: "2026-12-25T13:00:00" })).toEqual([
      "startAt",
    ]);
  });

  it("rejeita data em formato de calendário", () => {
    expect(issuePaths({ ...input, startAt: "2026-12-25" })).toEqual([
      "startAt",
    ]);
  });

  it("exige customerId, serviceId e employeeId", () => {
    expect(issuePaths({ startAt: input.startAt }).sort()).toEqual([
      "customerId",
      "employeeId",
      "serviceId",
    ]);
  });

  it("rejeita identificador que não é uuid", () => {
    expect(issuePaths({ ...input, employeeId: "abc" })).toEqual(["employeeId"]);
  });
});

describe("listAppointmentsSchema", () => {
  it("aceita consulta sem filtro nenhum", () => {
    expect(listAppointmentsSchema.parse({})).toEqual({});
  });

  it("converte o intervalo para Date", () => {
    const parsed = listAppointmentsSchema.parse({
      from: "2026-12-25T00:00:00.000Z",
      to: "2026-12-26T00:00:00.000Z",
    });

    expect(parsed.from).toEqual(new Date("2026-12-25T00:00:00.000Z"));
  });

  it("rejeita intervalo invertido", () => {
    expect(
      listPaths({
        from: "2026-12-26T00:00:00.000Z",
        to: "2026-12-25T00:00:00.000Z",
      }),
    ).toEqual(["to"]);
  });

  it("rejeita status fora do enum", () => {
    expect(listPaths({ status: "PENDENTE" })).toEqual(["status"]);
  });

  it("rejeita customerId que não é uuid", () => {
    expect(listPaths({ customerId: "abc" })).toEqual(["customerId"]);
  });
});

describe("rescheduleAppointmentSchema", () => {
  it("aceita apenas o novo horário", () => {
    const parsed = rescheduleAppointmentSchema.parse({
      startAt: "2026-12-25T13:00:00.000Z",
    });

    expect(parsed).toEqual({ startAt: new Date("2026-12-25T13:00:00.000Z") });
  });

  it("aceita troca de funcionário junto do horário", () => {
    const parsed = rescheduleAppointmentSchema.parse({
      startAt: "2026-12-25T13:00:00.000Z",
      employeeId: EMPLOYEE,
    });

    expect(parsed.employeeId).toBe(EMPLOYEE);
  });

  it("exige startAt", () => {
    expect(reschedulePaths({ employeeId: EMPLOYEE })).toEqual(["startAt"]);
  });

  it("exige fuso explícito em startAt", () => {
    expect(reschedulePaths({ startAt: "2026-12-25T13:00:00" })).toEqual([
      "startAt",
    ]);
  });
});
