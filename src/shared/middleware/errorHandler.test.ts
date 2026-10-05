import { describe, it, expect, vi, afterEach } from "vitest";
import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { errorHandler } from "./errorHandler";

type CapturedResponse = {
  statusCode?: number;
  body?: { status: string; message: string; code?: string };
};

function handle(err: unknown): CapturedResponse {
  const captured: CapturedResponse = {};

  const res = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(body: { status: string; message: string; code?: string }) {
      captured.body = body;
      return this;
    },
  } as unknown as Response;

  errorHandler(err, {} as Request, res, vi.fn() as unknown as NextFunction);

  return captured;
}

function knownError(code: string, message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: "7.8.0",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("errorHandler — erros do Prisma", () => {
  it("traduz P2003 (foreign key) em 409 explicando o vínculo", () => {
    const response = handle(
      knownError(
        "P2003",
        'Foreign key constraint violated on the constraint: "appointment_serviceId_fkey"',
      ),
    );

    expect(response.statusCode).toBe(409);
    expect(response.body?.message).toContain("vinculados");
    expect(response.body?.message).not.toContain("constraint");
  });

  it("traduz P2034 (conflito de escrita) em 409 de horário ocupado", () => {
    const response = handle(
      knownError(
        "P2034",
        "Transaction failed due to a write conflict or a deadlock",
      ),
    );

    expect(response.statusCode).toBe(409);
    expect(response.body?.message).toContain("horário");
    expect(response.body?.message).not.toContain("deadlock");
  });

  it("traduz a violação de constraint de exclusão (23P01) em 409 de horário ocupado", () => {
    const response = handle(
      new Prisma.PrismaClientUnknownRequestError(
        'Error occurred during query execution: ERROR: conflicting key value violates exclusion constraint "appointment_no_overlap" (code: 23P01)',
        { clientVersion: "7.8.0" },
      ),
    );

    expect(response.statusCode).toBe(409);
    expect(response.body?.message).toContain("horário");
    expect(response.body?.message).not.toContain("23P01");
  });

  it("mantém erro desconhecido do Prisma sem SQLSTATE tratado como 500 genérico", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = handle(
      new Prisma.PrismaClientUnknownRequestError(
        "Error occurred during query execution: connection closed",
        { clientVersion: "7.8.0" },
      ),
    );

    expect(response.statusCode).toBe(500);
    expect(response.body?.message).toBe("Erro interno do servidor");
  });
});

describe("errorHandler — o log nao vaza dado pessoal", () => {
  it("nao despeja o meta do Prisma no log do 500 generico", () => {
    const linhas: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((arg: unknown) => {
        linhas.push(String(arg));
      });

    const erro = new Prisma.PrismaClientKnownRequestError(
      "Falha desconhecida",
      {
        code: "P9999",
        clientVersion: "7.8.0",
        meta: { phone: "5511999999999", notes: "cliente é diabético" },
      },
    );

    const res = handle(erro);

    expect(res.statusCode).toBe(500);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).not.toContain("5511999999999");
    expect(linhas[0]).not.toContain("diabético");
    expect(JSON.parse(linhas[0]!).err.code).toBe("P9999");

    spy.mockRestore();
  });

  it("nao passa a mensagem do PrismaClientValidationError para o log", () => {
    const linhas: string[] = [];
    vi.spyOn(console, "error").mockImplementation((arg: unknown) => {
      linhas.push(String(arg));
    });

    const erro = new Prisma.PrismaClientValidationError(
      "Argument phone: 5511999999999 is invalid",
      { clientVersion: "7.8.0" },
    );

    const res = handle(erro);

    expect(res.statusCode).toBe(400);
    expect(linhas[0]).not.toContain("5511999999999");
  });
});

function driverAdapterError(code: string, message: string): Error {
  const error = new Error(message);
  error.name = "DriverAdapterError";
  Object.assign(error, {
    cause: {
      code,
      kind: "postgres",
      message,
      detail: "Failing row contains (uuid, uuid, 9, 540, 1080).",
    },
  });
  return error;
}

describe("errorHandler — SQLSTATE do driver do Prisma 7", () => {
  it("traduz 23514 em 400 sem repassar o texto cru do Postgres", () => {
    const erro = driverAdapterError(
      "23514",
      'new row for relation "BusinessHours" violates check constraint "BusinessHours_minutes_check"',
    );

    const res = handle(erro);

    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("CHECK_VIOLATION");
    expect(res.body?.message).not.toContain("check constraint");
    expect(res.body?.message).not.toContain("23514");
  });

  it("traduz 57014 em 503 DATABASE_TIMEOUT sem vazar a query", () => {
    const erro = driverAdapterError(
      "57014",
      "canceling statement due to statement timeout",
    );

    const res = handle(erro);

    expect(res.statusCode).toBe(503);
    expect(res.body?.code).toBe("DATABASE_TIMEOUT");
    expect(res.body?.message).not.toContain("statement timeout");
    expect(res.body?.message).not.toContain("57014");
  });

  it("traduz a violacao da constraint de exclusao em 409 SLOT_CONFLICT", () => {
    const erro = driverAdapterError(
      "23P01",
      'conflicting key value violates exclusion constraint "Appointment_employee_no_overlap"',
    );

    const res = handle(erro);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe("SLOT_CONFLICT");
    expect(res.body?.message).not.toContain("exclusion constraint");
  });

  it("traduz a falha de serializacao crua (40001) em 409 SLOT_CONFLICT", () => {
    const erro = driverAdapterError(
      "40001",
      "could not serialize access due to read/write dependencies among transactions",
    );

    const res = handle(erro);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe("SLOT_CONFLICT");
    expect(res.body?.message).not.toContain("serialize");
  });

  it("nao devolve o detail do Postgres, que carrega a linha inteira", () => {
    const erro = driverAdapterError("23514", "check constraint");

    expect(JSON.stringify(handle(erro).body)).not.toContain("Failing row");
  });
});

describe("errorHandler — AppError", () => {
  it("mantem mensagem e code do erro previsto de 4xx", () => {
    const res = handle(
      new AppError("Cliente não encontrado", 404, "NOT_FOUND"),
    );

    expect(res.statusCode).toBe(404);
    expect(res.body?.code).toBe("NOT_FOUND");
    expect(res.body?.message).toBe("Cliente não encontrado");
  });

  it("nao devolve a mensagem interna de um AppError de 5xx", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = handle(
      new AppError(
        "Timezone inválido: Mars/Olympus_Mons",
        500,
        "INVALID_TIMEZONE",
      ),
    );

    expect(res.statusCode).toBe(500);
    expect(res.body?.code).toBe("INTERNAL_ERROR");
    expect(res.body?.message).toBe("Erro interno do servidor");
    expect(JSON.stringify(res.body)).not.toContain("Mars/Olympus_Mons");
  });

  it("registra no log a causa do AppError de 5xx que nao vai para a resposta", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => {});

    handle(new AppError("Contexto de tenant ausente na requisição", 500));

    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0]?.[0]).toContain("Contexto de tenant ausente");
  });
});
