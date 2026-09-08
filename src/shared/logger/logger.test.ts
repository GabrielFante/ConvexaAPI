import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { logger } from "./logger";

function capture(): { linhas: () => string[]; restore: () => void } {
  const linhas: string[] = [];
  const push = (arg: unknown) => {
    linhas.push(String(arg));
  };

  const log = vi.spyOn(console, "log").mockImplementation(push);
  const err = vi.spyOn(console, "error").mockImplementation(push);

  return {
    linhas: () => linhas,
    restore: () => {
      log.mockRestore();
      err.mockRestore();
    },
  };
}

let saida: ReturnType<typeof capture>;

beforeEach(() => {
  saida = capture();
});

afterEach(() => {
  saida.restore();
});

function unica(): Record<string, unknown> {
  const linhas = saida.linhas();
  expect(linhas).toHaveLength(1);
  return JSON.parse(linhas[0]!) as Record<string, unknown>;
}

describe("logger", () => {
  it("emite uma linha JSON com nivel, horario e mensagem", () => {
    logger.info("API iniciada", { port: 3000 });

    const linha = unica();

    expect(linha.level).toBe("info");
    expect(linha.msg).toBe("API iniciada");
    expect(linha.port).toBe(3000);
    expect(typeof linha.time).toBe("string");
  });

  it("redige telefone, notas e senha do contexto", () => {
    logger.info("cliente criado", {
      id: "cus-1",
      phone: "5511999999999",
      notes: "cliente é diabético",
      password: "segredo",
    });

    const linha = unica();

    expect(linha.id).toBe("cus-1");
    expect(linha.phone).toBe("[REDACTED]");
    expect(linha.notes).toBe("[REDACTED]");
    expect(linha.password).toBe("[REDACTED]");
    expect(saida.linhas()[0]).not.toContain("5511999999999");
    expect(saida.linhas()[0]).not.toContain("diabético");
  });

  it("redige em objetos aninhados e dentro de listas", () => {
    logger.info("lote", {
      clientes: [{ nome: "Ana", phone: "5511900000000" }],
      dados: { interno: { tokenHash: "abc123" } },
    });

    const bruto = saida.linhas()[0]!;

    expect(bruto).not.toContain("5511900000000");
    expect(bruto).not.toContain("abc123");
  });

  it("redige as credenciais da Meta", () => {
    logger.info("empresa", {
      metaAccessToken: "EAAG-token-super-secreto",
      metaAppSecret: "app-secret-super-secreto",
      metaPhoneNumberId: "1234567890",
    });

    const linha = unica();

    expect(linha.metaAccessToken).toBe("[REDACTED]");
    expect(linha.metaAppSecret).toBe("[REDACTED]");
    expect(linha.metaPhoneNumberId).toBe("1234567890");
  });

  it("nao entra em laco com referencia circular", () => {
    const circular: Record<string, unknown> = { nome: "raiz" };
    circular.self = circular;

    expect(() => logger.info("circular", circular)).not.toThrow();
    expect(unica().nome).toBe("raiz");
  });

  it("nao despeja o meta de um erro do Prisma", () => {
    const erro = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "7.8.0",
        meta: { target: ["businessId", "phone"], phone: "5511999999999" },
      },
    );

    logger.error("Erro nao tratado", erro);

    const bruto = saida.linhas()[0]!;
    const linha = JSON.parse(bruto) as { err: Record<string, unknown> };

    expect(linha.err.code).toBe("P2002");
    expect(linha.err.meta).toBeUndefined();
    expect(bruto).not.toContain("5511999999999");
  });

  it("serializa erro que nao e Error sem quebrar", () => {
    logger.error("Erro nao tratado", "falha crua");

    expect((unica().err as Record<string, unknown>).message).toBe("falha crua");
  });

  it("escreve erro no console.error e info no console.log", () => {
    logger.error("falhou");
    logger.info("ok");

    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledTimes(1);
  });
});
