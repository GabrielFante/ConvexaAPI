import type { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError";
import {
  CHECK_VIOLATION,
  EXCLUSION_VIOLATION,
  hasSqlState,
  SERIALIZATION_FAILURE,
} from "../database/sqlstate";
import { logger } from "../logger/logger";

const SLOT_TAKEN_MESSAGE =
  "Este horário acabou de ser ocupado. Escolha outro horário e tente novamente";

const prismaErrors: Record<
  string,
  { status: number; code: string; message: string }
> = {
  P2002: {
    status: 409,
    code: "UNIQUE_VIOLATION",
    message: "Registro já existe com um valor único informado",
  },
  P2025: {
    status: 404,
    code: "NOT_FOUND",
    message: "Registro não encontrado",
  },
  P2003: {
    status: 409,
    code: "FOREIGN_KEY_VIOLATION",
    message:
      "Existem registros vinculados a este item. Remova-os antes de continuar",
  },
  P2023: {
    status: 400,
    code: "INVALID_ID",
    message: "Identificador inválido",
  },
  P2034: {
    status: 409,
    code: "SLOT_CONFLICT",
    message: SLOT_TAKEN_MESSAGE,
  },
};

function isPayloadTooLarge(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type?: unknown }).type === "entity.too.large"
  );
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    status: "error",
    code: "ROUTE_NOT_FOUND",
    message: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: "error",
      ...(err.code ? { code: err.code } : {}),
      message: err.message,
    });
    return;
  }

  if (isPayloadTooLarge(err)) {
    res.status(413).json({
      status: "error",
      code: "PAYLOAD_TOO_LARGE",
      message: "Corpo da requisição excede o tamanho máximo permitido",
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      status: "error",
      code: "VALIDATION_ERROR",
      message: "Dados de entrada inválidos",
      issues: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = prismaErrors[err.code];

    if (mapped) {
      res.status(mapped.status).json({
        status: "error",
        code: mapped.code,
        message: mapped.message,
      });
      return;
    }
  }

  if (
    hasSqlState(err, EXCLUSION_VIOLATION) ||
    hasSqlState(err, SERIALIZATION_FAILURE)
  ) {
    res.status(409).json({
      status: "error",
      code: "SLOT_CONFLICT",
      message: SLOT_TAKEN_MESSAGE,
    });
    return;
  }

  if (hasSqlState(err, CHECK_VIOLATION)) {
    res.status(400).json({
      status: "error",
      code: "CHECK_VIOLATION",
      message: "Dados de entrada inválidos",
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.error("Consulta invalida enviada ao Prisma", {
      name: err.name,
    });

    res.status(400).json({
      status: "error",
      code: "INVALID_REQUEST",
      message: "Dados de entrada inválidos",
    });
    return;
  }

  logger.error("Erro nao tratado", err);

  res.status(500).json({
    status: "error",
    code: "INTERNAL_ERROR",
    message: "Erro interno do servidor",
  });
};
