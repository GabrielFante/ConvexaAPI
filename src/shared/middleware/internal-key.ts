import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { env } from "../env";
import { AppError } from "../errors/AppError";

function matches(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);

  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }

  return timingSafeEqual(providedBytes, expectedBytes);
}

export const internalKeyMiddleware: RequestHandler = (req, _res, next) => {
  const key = req.header("x-internal-key");

  if (!key || !matches(key, env.INTERNAL_API_KEY)) {
    throw new AppError("Chave interna inválida", 401);
  }

  next();
};
