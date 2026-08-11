import { describe, it, expect } from "vitest";
import { parseCalendarDay, zonedDayToUtc } from "../../shared/utils/timezone";
import {
  checkSlot,
  computeAvailability,
  intersectIntervals,
  mergeIntervals,
} from "./availability";
import type { ScheduleContext } from "./scheduling.types";

const TIMEZONE = "America/Sao_Paulo";
const DAY = parseCalendarDay("2026-08-11");

function at(hour: number, minute = 0): Date {
  return zonedDayToUtc(DAY, hour * 60 + minute, TIMEZONE);
}

function context(overrides: Partial<ScheduleContext> = {}): ScheduleContext {
  return {
    timezone: TIMEZONE,
    slotIntervalMinutes: 30,
    bufferMinutes: 0,
    businessHours: [{ dayOfWeek: 2, opensAt: 9 * 60, closesAt: 12 * 60 }],
    closedDates: [],
    vacations: [],
    timeBlocks: [],
    appointments: [],
    employees: [{ employeeId: "emp-1", hours: [] }],
    day: DAY,
    durationMinutes: 60,
    now: at(0),
    ...overrides,
  };
}

function startTimes(ctx: ScheduleContext): string[] {
  return computeAvailability(ctx).map((slot) => slot.startAt.toISOString());
}

describe("computeAvailability", () => {
  it("gera slots respeitando o passo e o horário de funcionamento", () => {
    expect(startTimes(context())).toEqual([
      at(9).toISOString(),
      at(9, 30).toISOString(),
      at(10).toISOString(),
      at(10, 30).toISOString(),
      at(11).toISOString(),
    ]);
  });

  it("não oferece slot que ultrapassa o fechamento", () => {
    const slots = computeAvailability(context({ durationMinutes: 90 }));

    expect(slots).toHaveLength(4);
    expect(slots[3].startAt.toISOString()).toBe(at(10, 30).toISOString());
    expect(slots[3].endAt.toISOString()).toBe(at(12).toISOString());
  });

  it("não oferece nada em dia fechado", () => {
    const ctx = context({
      closedDates: [new Date("2026-08-11T00:00:00.000Z")],
    });

    expect(computeAvailability(ctx)).toEqual([]);
    expect(
      checkSlot(ctx, { employeeId: "emp-1", startAt: at(9), endAt: at(10) }),
    ).toBe("CLOSED_DAY");
  });

  it("não oferece nada em dia sem horário de funcionamento", () => {
    const ctx = context({
      businessHours: [{ dayOfWeek: 3, opensAt: 9 * 60, closesAt: 12 * 60 }],
    });

    expect(computeAvailability(ctx)).toEqual([]);
    expect(
      checkSlot(ctx, { employeeId: "emp-1", startAt: at(9), endAt: at(10) }),
    ).toBe("OUTSIDE_BUSINESS_HOURS");
  });

  it("não oferece nada durante férias da empresa", () => {
    const ctx = context({
      vacations: [
        {
          employeeId: null,
          startDate: new Date("2026-08-10T00:00:00.000Z"),
          endDate: new Date("2026-08-20T00:00:00.000Z"),
        },
      ],
    });

    expect(computeAvailability(ctx)).toEqual([]);
    expect(
      checkSlot(ctx, { employeeId: "emp-1", startAt: at(9), endAt: at(10) }),
    ).toBe("BUSINESS_VACATION");
  });

  it("remove o funcionário de férias e mantém os demais", () => {
    const ctx = context({
      employees: [
        { employeeId: "emp-1", hours: [] },
        { employeeId: "emp-2", hours: [] },
      ],
      vacations: [
        {
          employeeId: "emp-1",
          startDate: new Date("2026-08-11T00:00:00.000Z"),
          endDate: new Date("2026-08-11T00:00:00.000Z"),
        },
      ],
    });

    const employees = new Set(
      computeAvailability(ctx).map((slot) => slot.employeeId),
    );

    expect([...employees]).toEqual(["emp-2"]);
    expect(
      checkSlot(ctx, { employeeId: "emp-1", startAt: at(9), endAt: at(10) }),
    ).toBe("EMPLOYEE_VACATION");
  });

  it("respeita bloqueio temporário da empresa inteira", () => {
    const ctx = context({
      timeBlocks: [{ employeeId: null, startAt: at(9, 30), endAt: at(10, 30) }],
    });

    expect(startTimes(ctx)).toEqual([
      at(10, 30).toISOString(),
      at(11).toISOString(),
    ]);
    expect(
      checkSlot(ctx, { employeeId: "emp-1", startAt: at(10), endAt: at(11) }),
    ).toBe("TIME_BLOCK");
  });

  it("respeita bloqueio temporário de um funcionário específico", () => {
    const ctx = context({
      employees: [
        { employeeId: "emp-1", hours: [] },
        { employeeId: "emp-2", hours: [] },
      ],
      timeBlocks: [{ employeeId: "emp-1", startAt: at(9), endAt: at(12) }],
    });

    const employees = new Set(
      computeAvailability(ctx).map((slot) => slot.employeeId),
    );

    expect([...employees]).toEqual(["emp-2"]);
  });

  it("recusa conflito com agendamento existente", () => {
    const ctx = context({
      appointments: [
        {
          id: "appt-1",
          employeeId: "emp-1",
          startAt: at(10),
          endAt: at(11),
        },
      ],
    });

    expect(startTimes(ctx)).toEqual([
      at(9).toISOString(),
      at(11).toISOString(),
    ]);
    expect(
      checkSlot(ctx, {
        employeeId: "emp-1",
        startAt: at(10, 30),
        endAt: at(11, 30),
      }),
    ).toBe("APPOINTMENT_CONFLICT");
  });

  it("ignora agendamento cancelado do próprio contexto ao reagendar", () => {
    const ctx = context({
      appointments: [
        { id: "appt-1", employeeId: "emp-1", startAt: at(10), endAt: at(11) },
      ],
    });

    expect(
      checkSlot(ctx, {
        employeeId: "emp-1",
        startAt: at(10),
        endAt: at(11),
        ignoreAppointmentId: "appt-1",
      }),
    ).toBeNull();
  });

  it("aplica o intervalo entre atendimentos (buffer)", () => {
    const appointments = [
      { id: "appt-1", employeeId: "emp-1", startAt: at(10), endAt: at(11) },
    ];

    expect(startTimes(context({ appointments }))).toContain(
      at(9).toISOString(),
    );
    expect(
      startTimes(context({ appointments, bufferMinutes: 15 })),
    ).not.toContain(at(9).toISOString());
  });

  it("limita os slots à jornada do funcionário", () => {
    const ctx = context({
      employees: [
        {
          employeeId: "emp-1",
          hours: [{ dayOfWeek: 2, startsAt: 10 * 60, endsAt: 12 * 60 }],
        },
      ],
    });

    expect(startTimes(ctx)).toEqual([
      at(10).toISOString(),
      at(10, 30).toISOString(),
      at(11).toISOString(),
    ]);
    expect(
      checkSlot(ctx, { employeeId: "emp-1", startAt: at(9), endAt: at(10) }),
    ).toBe("OUTSIDE_EMPLOYEE_HOURS");
  });

  it("torna o funcionário indisponível em dia fora da sua jornada", () => {
    const ctx = context({
      employees: [
        {
          employeeId: "emp-1",
          hours: [{ dayOfWeek: 4, startsAt: 9 * 60, endsAt: 12 * 60 }],
        },
      ],
    });

    expect(computeAvailability(ctx)).toEqual([]);
  });

  it("descarta slots que já passaram", () => {
    expect(startTimes(context({ now: at(10) }))).toEqual([
      at(10).toISOString(),
      at(10, 30).toISOString(),
      at(11).toISOString(),
    ]);
    expect(
      checkSlot(context({ now: at(10) }), {
        employeeId: "emp-1",
        startAt: at(9),
        endAt: at(10),
      }),
    ).toBe("PAST");
  });

  it("ordena os slots por horário e depois por funcionário", () => {
    const ctx = context({
      employees: [
        { employeeId: "emp-2", hours: [] },
        { employeeId: "emp-1", hours: [] },
      ],
      durationMinutes: 180,
    });

    expect(computeAvailability(ctx).map((slot) => slot.employeeId)).toEqual([
      "emp-1",
      "emp-2",
    ]);
  });

  it("aceita um horário válido", () => {
    expect(
      checkSlot(context(), {
        employeeId: "emp-1",
        startAt: at(9),
        endAt: at(10),
      }),
    ).toBeNull();
  });
});

describe("álgebra de intervalos", () => {
  it("une intervalos sobrepostos ou adjacentes", () => {
    expect(
      mergeIntervals([
        { start: 540, end: 720 },
        { start: 700, end: 780 },
        { start: 900, end: 960 },
      ]),
    ).toEqual([
      { start: 540, end: 780 },
      { start: 900, end: 960 },
    ]);
  });

  it("intersecta duas listas de intervalos", () => {
    expect(
      intersectIntervals(
        [
          { start: 540, end: 720 },
          { start: 780, end: 1080 },
        ],
        [{ start: 600, end: 840 }],
      ),
    ).toEqual([
      { start: 600, end: 720 },
      { start: 780, end: 840 },
    ]);
  });
});
