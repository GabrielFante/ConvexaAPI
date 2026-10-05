import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../env";
import { AppError } from "../errors/AppError";
import { uuid } from "../validation/common";

const TOKEN_ISSUER = "convexa-api";
const AGENT_AUDIENCE = "convexa-agent";
const AGENT_SCOPE = "agent";

export const AGENT_TOKEN_TTL_SECONDS = 300;

export type AgentPrincipal = {
  customerId: string;
  businessId: string;
  timezone: string;
};

const agentTokenPayload = z.object({
  sub: uuid,
  businessId: uuid,
  timezone: z.string().min(1),
  scope: z.literal(AGENT_SCOPE),
});

export function signAgentToken(agent: AgentPrincipal): string {
  return jwt.sign(
    {
      businessId: agent.businessId,
      timezone: agent.timezone,
      scope: AGENT_SCOPE,
    },
    env.JWT_SECRET,
    {
      subject: agent.customerId,
      expiresIn: AGENT_TOKEN_TTL_SECONDS,
      issuer: TOKEN_ISSUER,
      audience: AGENT_AUDIENCE,
    },
  );
}

export function verifyAgentToken(token: string): AgentPrincipal {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: TOKEN_ISSUER,
      audience: AGENT_AUDIENCE,
    });
  } catch {
    throw new AppError("Token do agente inválido ou expirado", 401);
  }

  const parsed = agentTokenPayload.safeParse(decoded);

  if (!parsed.success) {
    throw new AppError("Token do agente inválido ou expirado", 401);
  }

  return {
    customerId: parsed.data.sub,
    businessId: parsed.data.businessId,
    timezone: parsed.data.timezone,
  };
}
