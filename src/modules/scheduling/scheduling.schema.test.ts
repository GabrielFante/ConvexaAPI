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
  it("aceita consulta sem funcionário e aplica o limit default", () => {
    expect(availabilityQuerySchema.parse(query)).toEqual({
      ...query,
      limit: 3,
    });
  });

  it("converte limit vindo da query string", () => {
    expect(availabilityQuerySchema.parse({ ...query, limit: "50" }).limit).toBe(
      50,
    );
  });

  it("rejeita limit acima de 100", () => {
    const result = availabilityQuerySchema.safeParse({ ...query, limit: 101 });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["limit"]);
  });

  it("rejeita limit menor que 1", () => {
    expect(
      availabilityQuerySchema.safeParse({ ...query, limit: 0 }).success,
    ).toBe(false);
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
