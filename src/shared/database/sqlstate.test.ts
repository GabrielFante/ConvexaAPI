import { describe, it, expect } from "vitest";
import {
  CHECK_VIOLATION,
  EXCLUSION_VIOLATION,
  hasSqlState,
  SERIALIZATION_FAILURE,
  sqlStateOf,
} from "./sqlstate";

function driverAdapterError(code: string, message: string): Error {
  const error = new Error(message);
  error.name = "DriverAdapterError";
  Object.assign(error, {
    cause: {
      originalCode: code,
      code,
      kind: "postgres",
      severity: "ERROR",
      message,
      detail: "Failing row contains (uuid, uuid, 9, 540, 1080).",
    },
  });
  return error;
}

describe("sqlStateOf", () => {
  it("le o SQLSTATE do cause do DriverAdapterError do Prisma 7", () => {
    const erro = driverAdapterError(
      CHECK_VIOLATION,
      'new row for relation "BusinessHours" violates check constraint',
    );

    expect(sqlStateOf(erro)).toBe("23514");
  });

  it("devolve undefined quando nao ha cause", () => {
    expect(sqlStateOf(new Error("qualquer coisa"))).toBeUndefined();
    expect(sqlStateOf(null)).toBeUndefined();
    expect(sqlStateOf("texto")).toBeUndefined();
  });

  it("devolve undefined quando o cause nao tem code de texto", () => {
    const erro = new Error("x");
    Object.assign(erro, { cause: { code: 23514 } });

    expect(sqlStateOf(erro)).toBeUndefined();
  });
});

describe("hasSqlState", () => {
  it("reconhece a violacao da constraint de exclusao pelo cause", () => {
    const erro = driverAdapterError(
      EXCLUSION_VIOLATION,
      "conflicting key value violates exclusion constraint",
    );

    expect(hasSqlState(erro, EXCLUSION_VIOLATION)).toBe(true);
    expect(hasSqlState(erro, CHECK_VIOLATION)).toBe(false);
  });

  it("continua reconhecendo o SQLSTATE embutido na mensagem", () => {
    const erro = new Error("erro cru com SQLSTATE 40001 no texto");

    expect(hasSqlState(erro, SERIALIZATION_FAILURE)).toBe(true);
  });

  it("nao confunde codigos diferentes", () => {
    const erro = driverAdapterError(CHECK_VIOLATION, "check constraint");

    expect(hasSqlState(erro, SERIALIZATION_FAILURE)).toBe(false);
  });
});
