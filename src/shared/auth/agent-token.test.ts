import { describe, it, expect, afterEach, vi } from "vitest";
import {
  AGENT_TOKEN_TTL_SECONDS,
  signAgentToken,
  verifyAgentToken,
} from "./agent-token";
import { signAccessToken, verifyAccessToken } from "./jwt";

const agent = {
  customerId: "cccccccc-1111-4111-8111-111111111111",
  businessId: "11111111-1111-4111-8111-111111111111",
  timezone: "America/Sao_Paulo",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("token do agente", () => {
  it("devolve cliente, tenant e fuso assinados", () => {
    expect(verifyAgentToken(signAgentToken(agent))).toEqual(agent);
  });

  it("expira em 5 minutos", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00.000Z"));
    const token = signAgentToken(agent);

    vi.setSystemTime(
      new Date(Date.now() + (AGENT_TOKEN_TTL_SECONDS - 1) * 1000),
    );
    expect(verifyAgentToken(token)).toEqual(agent);

    vi.setSystemTime(new Date(Date.now() + 2000));
    expect(() => verifyAgentToken(token)).toThrow(
      "Token do agente inválido ou expirado",
    );
  });

  it("não é aceito como token do painel", () => {
    expect(() => verifyAccessToken(signAgentToken(agent))).toThrow(
      "Token inválido ou expirado",
    );
  });

  it("o token do painel não é aceito como token do agente", () => {
    const panel = signAccessToken({
      userId: "aaaaaaaa-1111-4111-8111-111111111111",
      businessId: agent.businessId,
      role: "OWNER",
    });

    expect(() => verifyAgentToken(panel)).toThrow(
      "Token do agente inválido ou expirado",
    );
  });

  it("recusa token adulterado", () => {
    const [header, , signature] = signAgentToken(agent).split(".");
    const forged = Buffer.from(
      JSON.stringify({
        ...agent,
        sub: agent.customerId,
        businessId: "22222222-2222-4222-8222-222222222222",
        scope: "agent",
      }),
    ).toString("base64url");

    expect(() => verifyAgentToken(`${header}.${forged}.${signature}`)).toThrow(
      "Token do agente inválido ou expirado",
    );
  });
});
