import { describe, it, expect } from "vitest";
import { retryDelaySeconds } from "./whatsapp.service";

describe("retryDelaySeconds", () => {
  it("começa em 30s e dobra a cada tentativa", () => {
    expect([1, 2, 3, 4].map(retryDelaySeconds)).toEqual([30, 60, 120, 240]);
  });

  it("não passa de 15 minutos", () => {
    expect(retryDelaySeconds(10)).toBe(900);
    expect(retryDelaySeconds(50)).toBe(900);
  });

  it("trata zero tentativas como a primeira", () => {
    expect(retryDelaySeconds(0)).toBe(30);
  });
});
