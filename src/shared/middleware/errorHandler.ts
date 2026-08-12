import type { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError";

const SLOT_TAKEN_MESSAGE =
  "Este horário acabou de ser ocupado. Escolha outro horário e tente novamente";

const EXCLUSION_CONSTRAINT_SQLSTATE = "23P01";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    status: "error",
    message: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      status: "error",
      message: "Dados de entrada inválidos",
      issues: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({
        status: "error",
        message: "Registro já existe com um valor único informado",
      });
      return;
    }

    if (err.code === "P2025") {
      res.status(404).json({
        status: "error",
        message: "Registro não encontrado",
      });
      return;
    }

    if (err.code === "P2003") {
      res.status(409).json({
        status: "error",
        message:
          "Existem registros vinculados a este item. Remova-os antes de continuar",
      });
      return;
    }

    if (err.code === "P2034") {
      res.status(409).json({
        status: "error",
        message: SLOT_TAKEN_MESSAGE,
      });
      return;
    }
  }

  if (
    err instanceof Prisma.PrismaClientUnknownRequestError &&
    err.message.includes(EXCLUSION_CONSTRAINT_SQLSTATE)
  ) {
    res.status(409).json({
      status: "error",
      message: SLOT_TAKEN_MESSAGE,
    });
    return;
  }

  console.error(err);

  res.status(500).json({
    status: "error",
    message: "Erro interno do servidor",
  });
};
