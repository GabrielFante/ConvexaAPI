import { describe, it, expect } from "vitest";
import { createAppointmentSchema } from "./appointment.schema";

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const SERVICE = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE = "33333333-3333-4333-8333-333333333333";

const input = {
  customerId: CUSTOMER,
  serviceId: SERVICE,
  employeeId: EMPLOYEE,
  startAt: "2026-12-25T13:00:00.000Z",
};

function issuePaths(data: unknown): string[] {
  const result = createAppointmentSchema.safeParse(data);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
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
