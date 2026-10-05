import type { RequestHandler } from "express";
import { verifyAgentToken } from "../auth/agent-token";
import { AppError } from "../errors/AppError";
import { runWithAgent } from "../tenant/tenant-context";

const BEARER_PREFIX = "Bearer ";

export const agentAuthMiddleware: RequestHandler = (req, _res, next) => {
  const header = req.header("authorization");
  const token = header?.startsWith(BEARER_PREFIX)
    ? header.slice(BEARER_PREFIX.length).trim()
    : "";

  if (!token) {
    throw new AppError("Token do agente ausente", 401);
  }

  runWithAgent(verifyAgentToken(token), () => next());
};
