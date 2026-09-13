import { describe, it, expect } from "vitest";
import { parseCalendarDay, zonedDayToUtc } from "../../shared/utils/timezone";
import {
  checkSlot,
  computeAvailability,
  employeeWindows,
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

const SPLIT_BUSINESS_HOURS = [
  { dayOfWeek: 2, opensAt: 8 * 60, closesAt: 12 * 60 },
  { dayOfWeek: 2, opensAt: 14 * 60, closesAt: 18 * 60 },
];

const SPLIT_START_TIMES = [
  at(8),
  at(8, 30),
  at(9),
  at(9, 30),
  at(10),
  at(10, 30),
  at(11),
  at(14),
  at(14, 30),
  at(15),
  at(15, 30),
  at(16),
  at(16, 30),
  at(17),
].map((date) => date.toISOString());

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

  it("respeita jornada partida da empresa sem oferecer o intervalo de almoço", () => {
    const ctx = context({ businessHours: SPLIT_BUSINESS_HOURS });

    expect(startTimes(ctx)).toEqual(SPLIT_START_TIMES);
    expect(
      checkSlot(ctx, {
        employeeId: "emp-1",
        startAt: at(11, 30),
        endAt: at(12, 30),
      }),
    ).toBe("OUTSIDE_BUSINESS_HOURS");
    expect(
      checkSlot(ctx, { employeeId: "emp-1", startAt: at(12), endAt: at(13) }),
    ).toBe("OUTSIDE_BUSINESS_HOURS");
    expect(
      checkSlot(ctx, { employeeId: "emp-1", startAt: at(14), endAt: at(15) }),
    ).toBeNull();
  });

  it("respeita jornada partida do funcionário dentro do horário da empresa", () => {
    const ctx = context({
      businessHours: [{ dayOfWeek: 2, opensAt: 8 * 60, closesAt: 18 * 60 }],
      employees: [
        {
          employeeId: "emp-1",
          hours: SPLIT_BUSINESS_HOURS.map((hour) => ({
            dayOfWeek: hour.dayOfWeek,
            startsAt: hour.opensAt,
            endsAt: hour.closesAt,
          })),
        },
      ],
    });

    expect(startTimes(ctx)).toEqual(SPLIT_START_TIMES);
    expect(
      checkSlot(ctx, {
        employeeId: "emp-1",
        startAt: at(11, 30),
        endAt: at(12, 30),
      }),
    ).toBe("OUTSIDE_EMPLOYEE_HOURS");
  });

  it("funcionário sem jornada cadastrada herda a jornada partida da empresa", () => {
    const ctx = context({ businessHours: SPLIT_BUSINESS_HOURS });

    expect(employeeWindows(ctx, "emp-1")).toEqual([
      { start: 8 * 60, end: 12 * 60 },
      { start: 14 * 60, end: 18 * 60 },
    ]);
  });

  it("funcionário com jornada em outros dias não trabalha no dia sem horas", () => {
    const ctx = context({
      employees: [
        { employeeId: "emp-1", hours: [] },
        {
          employeeId: "emp-2",
          hours: [{ dayOfWeek: 4, startsAt: 9 * 60, endsAt: 12 * 60 }],
        },
      ],
    });

    const employees = new Set(
      computeAvailability(ctx).map((slot) => slot.employeeId),
    );

    expect([...employees]).toEqual(["emp-1"]);
    expect(
      checkSlot(ctx, { employeeId: "emp-1", startAt: at(9), endAt: at(10) }),
    ).toBeNull();
    expect(
      checkSlot(ctx, { employeeId: "emp-2", startAt: at(9), endAt: at(10) }),
    ).toBe("OUTSIDE_EMPLOYEE_HOURS");
  });

  it("limita a jornada do funcionário ao horário da empresa", () => {
    const ctx = context({
      employees: [
        {
          employeeId: "emp-1",
          hours: [{ dayOfWeek: 2, startsAt: 7 * 60, endsAt: 20 * 60 }],
        },
      ],
    });

    expect(employeeWindows(ctx, "emp-1")).toEqual([
      { start: 9 * 60, end: 12 * 60 },
    ]);
    expect(startTimes(ctx)).toEqual(startTimes(context()));
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

describe("computeAvailability em dia de transição do horário de verão", () => {
  const NEW_YORK = "America/New_York";

  function transitionContext(isoDay: string): ScheduleContext {
    return context({
      timezone: NEW_YORK,
      day: parseCalendarDay(isoDay),
      businessHours: [{ dayOfWeek: 0, opensAt: 0, closesAt: 4 * 60 }],
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
  }

  it("não duplica slots na hora que deixa de existir", () => {
    expect(startTimes(transitionContext("2026-03-08"))).toEqual([
      "2026-03-08T05:00:00.000Z",
      "2026-03-08T05:30:00.000Z",
      "2026-03-08T06:00:00.000Z",
      "2026-03-08T06:30:00.000Z",
      "2026-03-08T07:00:00.000Z",
    ]);
  });

  it("oferece as duas ocorrências da hora que se repete", () => {
    expect(startTimes(transitionContext("2026-11-01"))).toEqual([
      "2026-11-01T04:00:00.000Z",
      "2026-11-01T04:30:00.000Z",
      "2026-11-01T05:00:00.000Z",
      "2026-11-01T05:30:00.000Z",
      "2026-11-01T06:00:00.000Z",
      "2026-11-01T06:30:00.000Z",
      "2026-11-01T07:00:00.000Z",
      "2026-11-01T07:30:00.000Z",
      "2026-11-01T08:00:00.000Z",
    ]);
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
