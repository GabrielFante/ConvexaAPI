import { describe, it, expect, vi, afterEach } from "vitest";
import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { errorHandler } from "./errorHandler";

type CapturedResponse = {
  statusCode?: number;
  body?: { status: string; message: string };
};

function handle(err: unknown): CapturedResponse {
  const captured: CapturedResponse = {};

  const res = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(body: { status: string; message: string }) {
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
