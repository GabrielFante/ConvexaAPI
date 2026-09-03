import type { RequestHandler } from "express";
import type { AuthUser } from "../auth/jwt";
import { verifyAccessToken } from "../auth/jwt";
import { AppError } from "../errors/AppError";
import { getCurrentUser, runWithAuth } from "../tenant/tenant-context";

const BEARER_PREFIX = "Bearer ";

export const authMiddleware: RequestHandler = (req, _res, next) => {
  const header = req.header("authorization");

  if (!header?.startsWith(BEARER_PREFIX)) {
    throw new AppError("Token de acesso ausente", 401);
  }

  const token = header.slice(BEARER_PREFIX.length).trim();

  if (!token) {
    throw new AppError("Token de acesso ausente", 401);
  }

  runWithAuth(verifyAccessToken(token), () => next());
};

export function requireRole(...roles: AuthUser["role"][]): RequestHandler {
  return (_req, _res, next) => {
    if (!roles.includes(getCurrentUser().role)) {
      throw new AppError("Você não tem permissão para esta ação", 403);
    }

    next();
  };
}
