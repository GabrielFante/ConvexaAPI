import type { RequestHandler } from "express";
import { env } from "../env";
import { AppError } from "../errors/AppError";
import { safeEqual } from "../utils/safe-equal";

export const internalKeyMiddleware: RequestHandler = (req, _res, next) => {
  const key = req.header("x-internal-key");

  if (!key || !safeEqual(key, env.INTERNAL_API_KEY)) {
    throw new AppError("Chave interna inválida", 401);
  }

  next();
};
