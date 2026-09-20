import { describe, it, expect } from "vitest";
import { normalizePhone, phone } from "./phone";

describe("normalizePhone — formatos diferentes do mesmo número", () => {
  const equivalentes = [
    "+5511999999999",
    "5511999999999",
    "11999999999",
    "(11) 99999-9999",
    "11 99999-9999",
    "  (11) 9 9999-9999  ",
    "+55 (11) 99999.9999",
  ];

  it.each(equivalentes)("normaliza %j para o mesmo E.164", (entrada) => {
    expect(normalizePhone(entrada)).toBe("+5511999999999");
  });

  it("é o bug que motivou a mudança: variações não podem gerar clientes distintos", () => {
    const normalizados = new Set(
      equivalentes.map((entrada) => normalizePhone(entrada)),
    );

    expect(normalizados.size).toBe(1);
  });
});

describe("normalizePhone — casos que não são celular de São Paulo", () => {
  it("aceita fixo com 8 dígitos", () => {
    expect(normalizePhone("11 3333-4444")).toBe("+551133334444");
  });

  it("aceita DDD de outros estados", () => {
    expect(normalizePhone("99 99999-9999")).toBe("+5599999999999");
    expect(normalizePhone("(85) 98888-7777")).toBe("+5585988887777");
  });

  it("respeita DDI explícito em vez de assumir o Brasil", () => {
    expect(normalizePhone("+1 415 555 2671")).toBe("+14155552671");
    expect(normalizePhone("+351 912 345 678")).toBe("+351912345678");
  });
});

describe("normalizePhone — entrada que não dá telefone", () => {
  it.each([
    ["texto", "abc"],
    ["só o DDI", "+55"],
    ["dígitos demais", "5511999999999999"],
    ["vazio", ""],
    ["curto demais", "11 999"],
  ])("recusa %s", (_caso, entrada) => {
    expect(normalizePhone(entrada)).toBeUndefined();
  });

  it("recusa o que a lib normalizaria para um número diferente do informado", () => {
    expect(normalizePhone("90 99999-9999")).toBeUndefined();
  });

  it("aceita DDD que não existe no Brasil — limite conhecido da validação", () => {
    expect(normalizePhone("10 99999-9999")).toBe("+5510999999999");
  });
});

describe("phone — o schema do Zod", () => {
  it("devolve o número já em E.164, não o que foi digitado", () => {
    expect(phone.parse("(11) 99999-9999")).toBe("+5511999999999");
  });

  it("recusa número inválido com mensagem em português", () => {
    const result = phone.safeParse("11 999");

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("telefone válido");
  });

  it("cobra o campo quando vem string vazia", () => {
    const result = phone.safeParse("   ");

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("obrigatório");
  });
});
