import type { RequestHandler } from "express";
import { verifyConversationToken } from "../auth/conversation-token";
import { AppError } from "../errors/AppError";
import { runWithConversation } from "../tenant/tenant-context";

const BEARER_PREFIX = "Bearer ";

export const conversationAuthMiddleware: RequestHandler = (req, _res, next) => {
  const header = req.header("authorization");
  const token = header?.startsWith(BEARER_PREFIX)
    ? header.slice(BEARER_PREFIX.length).trim()
    : "";

  if (!token) {
    throw new AppError("Token da conversa ausente", 401);
  }

  runWithConversation(verifyConversationToken(token), () => next());
};
