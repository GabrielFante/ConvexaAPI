import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../env";
import { AppError } from "../errors/AppError";
import { uuid } from "../validation/common";

const TOKEN_ISSUER = "convexa-api";
const CONVERSATION_AUDIENCE = "convexa-conversation";
const CONVERSATION_SCOPE = "conversation";

export const CONVERSATION_TOKEN_TTL_SECONDS = 300;

export type ConversationPrincipal = {
  customerId: string;
  businessId: string;
  timezone: string;
};

const conversationTokenPayload = z.object({
  sub: uuid,
  businessId: uuid,
  timezone: z.string().min(1),
  scope: z.literal(CONVERSATION_SCOPE),
});

export function signConversationToken(
  conversation: ConversationPrincipal,
): string {
  return jwt.sign(
    {
      businessId: conversation.businessId,
      timezone: conversation.timezone,
      scope: CONVERSATION_SCOPE,
    },
    env.JWT_SECRET,
    {
      subject: conversation.customerId,
      expiresIn: CONVERSATION_TOKEN_TTL_SECONDS,
      issuer: TOKEN_ISSUER,
      audience: CONVERSATION_AUDIENCE,
    },
  );
}

export function verifyConversationToken(token: string): ConversationPrincipal {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: TOKEN_ISSUER,
      audience: CONVERSATION_AUDIENCE,
    });
  } catch {
    throw new AppError("Token da conversa inválido ou expirado", 401);
  }

  const parsed = conversationTokenPayload.safeParse(decoded);

  if (!parsed.success) {
    throw new AppError("Token da conversa inválido ou expirado", 401);
  }

  return {
    customerId: parsed.data.sub,
    businessId: parsed.data.businessId,
    timezone: parsed.data.timezone,
  };
}
