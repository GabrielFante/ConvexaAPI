import { describe, it, expect } from "vitest";
import {
  createEmployeeSchema,
  setEmployeeHoursSchema,
} from "./employee.schema";

const overlapping = [
  { dayOfWeek: 1, startsAt: 540, endsAt: 1080 },
  { dayOfWeek: 1, startsAt: 600, endsAt: 720 },
];

const lunchBreak = [
  { dayOfWeek: 1, startsAt: 540, endsAt: 720 },
  { dayOfWeek: 1, startsAt: 780, endsAt: 1080 },
];

describe("employee schema — jornada", () => {
  it("rejeita faixas sobrepostas no mesmo dia da semana", () => {
    expect(
      setEmployeeHoursSchema.safeParse({ hours: overlapping }).success,
    ).toBe(false);
  });

  it("aceita intervalo de almoço no mesmo dia", () => {
    expect(
      setEmployeeHoursSchema.safeParse({ hours: lunchBreak }).success,
    ).toBe(true);
  });

  it("aceita o mesmo horário em dias diferentes", () => {
    const result = setEmployeeHoursSchema.safeParse({
      hours: [
        { dayOfWeek: 1, startsAt: 540, endsAt: 1080 },
        { dayOfWeek: 2, startsAt: 540, endsAt: 1080 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("aplica a mesma regra na criação do funcionário", () => {
    const employee = { name: "Gabriel" };

    expect(
      createEmployeeSchema.safeParse({ ...employee, hours: overlapping })
        .success,
    ).toBe(false);
    expect(
      createEmployeeSchema.safeParse({ ...employee, hours: lunchBreak })
        .success,
    ).toBe(true);
  });
});
