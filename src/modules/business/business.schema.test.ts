import { describe, it, expect } from "vitest";
import {
  createBusinessSchema,
  createClosedDaySchema,
  createVacationSchema,
  updateBusinessSchema,
} from "./business.schema";

const validBusiness = {
  name: "Barbearia do Gabriel",
  slug: "barbearia-do-gabriel",
};

describe("business schema — timezone", () => {
  it("aceita um fuso horário IANA na criação", () => {
    const result = createBusinessSchema.safeParse({
      ...validBusiness,
      timezone: "America/Sao_Paulo",
    });

    expect(result.success).toBe(true);
    expect(result.data?.timezone).toBe("America/Sao_Paulo");
  });

  it("rejeita fuso horário inexistente na criação", () => {
    const result = createBusinessSchema.safeParse({
      ...validBusiness,
      timezone: "banana",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["timezone"]);
  });

  it("rejeita fuso horário vazio na criação", () => {
    const result = createBusinessSchema.safeParse({
      ...validBusiness,
      timezone: "",
    });

    expect(result.success).toBe(false);
  });

  it("aplica a mesma validação na atualização", () => {
    expect(
      updateBusinessSchema.safeParse({ timezone: "Europe/Lisbon" }).success,
    ).toBe(true);
    expect(updateBusinessSchema.safeParse({ timezone: "banana" }).success).toBe(
      false,
    );
    expect(updateBusinessSchema.safeParse({ timezone: "" }).success).toBe(
      false,
    );
  });

  it("continua aceitando a empresa sem timezone informado", () => {
    expect(createBusinessSchema.safeParse(validBusiness).success).toBe(true);
  });
});

describe("business schema — datas de dia fechado e férias", () => {
  const rejected = ["2026-12-25T23:00:00-03:00", "25/12/2026", "2026-02-30"];

  it("aceita a data no formato YYYY-MM-DD e a mantém como string", () => {
    const result = createClosedDaySchema.safeParse({ date: "2026-12-25" });

    expect(result.success).toBe(true);
    expect(result.data?.date).toBe("2026-12-25");
  });

  it.each(rejected)("rejeita %s em closedDay", (date) => {
    expect(createClosedDaySchema.safeParse({ date }).success).toBe(false);
  });

  it("aceita um período de férias válido", () => {
    const result = createVacationSchema.safeParse({
      startDate: "2026-12-24",
      endDate: "2026-12-26",
    });

    expect(result.success).toBe(true);
  });

  it.each(rejected)("rejeita %s em vacation", (date) => {
    expect(
      createVacationSchema.safeParse({ startDate: date, endDate: "2026-12-26" })
        .success,
    ).toBe(false);
    expect(
      createVacationSchema.safeParse({ startDate: "2026-12-24", endDate: date })
        .success,
    ).toBe(false);
  });

  it("continua recusando férias que terminam antes de começar", () => {
    expect(
      createVacationSchema.safeParse({
        startDate: "2026-12-26",
        endDate: "2026-12-24",
      }).success,
    ).toBe(false);
  });
});
