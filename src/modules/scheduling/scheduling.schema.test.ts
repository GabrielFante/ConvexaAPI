import { describe, it, expect } from "vitest";
import { availabilityQuerySchema } from "./scheduling.schema";

const SERVICE = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE = "33333333-3333-4333-8333-333333333333";

const query = { serviceId: SERVICE, date: "2026-12-25" };

function issuePaths(data: unknown): string[] {
  const result = availabilityQuerySchema.safeParse(data);

  if (result.success) {
    return [];
  }

  return [...new Set(result.error.issues.map((i) => i.path.join(".")))];
}

describe("availabilityQuerySchema", () => {
  it("aceita consulta sem funcionário", () => {
    expect(availabilityQuerySchema.parse(query)).toEqual(query);
  });

  it("converte slotIntervalMinutes vindo da query string", () => {
    const parsed = availabilityQuerySchema.parse({
      ...query,
      slotIntervalMinutes: "30",
    });

    expect(parsed.slotIntervalMinutes).toBe(30);
  });

  it("exige serviceId e date", () => {
    expect(issuePaths({}).sort()).toEqual(["date", "serviceId"]);
  });

  it("rejeita data com hora e fuso", () => {
    expect(issuePaths({ ...query, date: "2026-12-25T23:00:00-03:00" })).toEqual(
      ["date"],
    );
  });

  it("rejeita data inexistente no calendário", () => {
    expect(issuePaths({ ...query, date: "2026-02-30" })).toEqual(["date"]);
  });

  it("rejeita intervalo de slot fora da faixa", () => {
    expect(issuePaths({ ...query, slotIntervalMinutes: "1" })).toEqual([
      "slotIntervalMinutes",
    ]);
    expect(issuePaths({ ...query, slotIntervalMinutes: "600" })).toEqual([
      "slotIntervalMinutes",
    ]);
  });

  it("rejeita employeeId que não é uuid", () => {
    expect(issuePaths({ ...query, employeeId: "abc" })).toEqual(["employeeId"]);
    expect(
      availabilityQuerySchema.parse({ ...query, employeeId: EMPLOYEE })
        .employeeId,
    ).toBe(EMPLOYEE);
  });
});
