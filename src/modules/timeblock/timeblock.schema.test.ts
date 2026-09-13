import { describe, it, expect } from "vitest";
import {
  createTimeBlockSchema,
  listTimeBlocksSchema,
  updateTimeBlockSchema,
} from "./timeblock.schema";

describe("timeblock schema", () => {
  it("converte ISO-8601 com fuso para Date", () => {
    const result = createTimeBlockSchema.safeParse({
      startAt: "2026-12-25T10:00:00-03:00",
      endAt: "2026-12-25T12:00:00-03:00",
      reason: "Dentista",
    });

    expect(result.success).toBe(true);
    expect(result.data?.startAt).toEqual(new Date("2026-12-25T13:00:00.000Z"));
  });

  it("rejeita fim anterior ou igual ao início", () => {
    const inverted = createTimeBlockSchema.safeParse({
      startAt: "2026-12-25T12:00:00Z",
      endAt: "2026-12-25T10:00:00Z",
    });
    const equal = createTimeBlockSchema.safeParse({
      startAt: "2026-12-25T12:00:00Z",
      endAt: "2026-12-25T12:00:00Z",
    });

    expect(inverted.success).toBe(false);
    expect(equal.success).toBe(false);
  });

  it("rejeita data e hora sem fuso", () => {
    const result = createTimeBlockSchema.safeParse({
      startAt: "2026-12-25T10:00:00",
      endAt: "2026-12-25T12:00:00",
    });

    expect(result.success).toBe(false);
  });

  it("aceita listagem sem filtro e recusa intervalo invertido", () => {
    expect(listTimeBlocksSchema.safeParse({}).success).toBe(true);
    expect(
      listTimeBlocksSchema.safeParse({
        from: "2026-12-26T00:00:00Z",
        to: "2026-12-25T00:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("aceita update parcial e recusa intervalo invertido", () => {
    expect(updateTimeBlockSchema.safeParse({}).success).toBe(true);
    expect(
      updateTimeBlockSchema.safeParse({ reason: "Dentista" }).success,
    ).toBe(true);
    expect(
      updateTimeBlockSchema.safeParse({ startAt: "2026-12-25T10:00:00Z" })
        .success,
    ).toBe(true);
    expect(
      updateTimeBlockSchema.safeParse({
        startAt: "2026-12-25T12:00:00Z",
        endAt: "2026-12-25T10:00:00Z",
      }).success,
    ).toBe(false);
  });
});
