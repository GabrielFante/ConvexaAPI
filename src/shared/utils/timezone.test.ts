import { describe, it, expect } from "vitest";
import {
  addCalendarDays,
  dayOfWeekOf,
  formatCalendarDay,
  getZonedParts,
  parseCalendarDay,
  zonedDayToUtc,
} from "./timezone";

describe("timezone", () => {
  it("converte hora local do tenant para UTC", () => {
    const day = parseCalendarDay("2026-08-11");
    const utc = zonedDayToUtc(day, 9 * 60, "America/Sao_Paulo");

    expect(utc.toISOString()).toBe("2026-08-11T12:00:00.000Z");
  });

  it("respeita o horário de verão do timezone", () => {
    const day = parseCalendarDay("2026-07-15");

    expect(zonedDayToUtc(day, 12 * 60, "America/New_York").toISOString()).toBe(
      "2026-07-15T16:00:00.000Z",
    );
    expect(
      zonedDayToUtc(
        parseCalendarDay("2026-01-15"),
        12 * 60,
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-01-15T17:00:00.000Z");
  });

  it("mantém o dia local correto perto da meia-noite", () => {
    const parts = getZonedParts(
      new Date("2026-08-12T02:00:00.000Z"),
      "America/Sao_Paulo",
    );

    expect(formatCalendarDay(parts)).toBe("2026-08-11");
    expect(parts.minuteOfDay).toBe(23 * 60);
  });

  it("faz round trip entre UTC e hora local", () => {
    const day = parseCalendarDay("2026-03-01");
    const utc = zonedDayToUtc(day, 8 * 60 + 30, "America/Sao_Paulo");
    const parts = getZonedParts(utc, "America/Sao_Paulo");

    expect(formatCalendarDay(parts)).toBe("2026-03-01");
    expect(parts.minuteOfDay).toBe(8 * 60 + 30);
  });

  it("calcula o dia da semana do calendário", () => {
    expect(dayOfWeekOf(parseCalendarDay("2026-08-11"))).toBe(2);
    expect(dayOfWeekOf(parseCalendarDay("2026-08-16"))).toBe(0);
  });

  it("soma dias respeitando a virada de mês", () => {
    expect(
      formatCalendarDay(addCalendarDays(parseCalendarDay("2026-08-31"), 1)),
    ).toBe("2026-09-01");
  });

  it("rejeita datas fora do formato ou inexistentes", () => {
    expect(() => parseCalendarDay("11/08/2026")).toThrow();
    expect(() => parseCalendarDay("2026-02-30")).toThrow();
  });
});
