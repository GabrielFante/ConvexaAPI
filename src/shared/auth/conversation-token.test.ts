import { describe, it, expect, afterEach, vi } from "vitest";
import {
  CONVERSATION_TOKEN_TTL_SECONDS,
  signConversationToken,
  verifyConversationToken,
} from "./conversation-token";
import { signAccessToken, verifyAccessToken } from "./jwt";

const conversation = {
  customerId: "cccccccc-1111-4111-8111-111111111111",
  businessId: "11111111-1111-4111-8111-111111111111",
  timezone: "America/Sao_Paulo",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("token da conversa", () => {
  it("devolve cliente, tenant e fuso assinados", () => {
    expect(
      verifyConversationToken(signConversationToken(conversation)),
    ).toEqual(conversation);
  });

  it("expira em 5 minutos", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00.000Z"));
    const token = signConversationToken(conversation);

    vi.setSystemTime(
      new Date(Date.now() + (CONVERSATION_TOKEN_TTL_SECONDS - 1) * 1000),
    );
    expect(verifyConversationToken(token)).toEqual(conversation);

    vi.setSystemTime(new Date(Date.now() + 2000));
    expect(() => verifyConversationToken(token)).toThrow(
      "Token da conversa inválido ou expirado",
    );
  });

  it("não é aceito como token do painel", () => {
    expect(() =>
      verifyAccessToken(signConversationToken(conversation)),
    ).toThrow("Token inválido ou expirado");
  });

  it("o token do painel não é aceito como token da conversa", () => {
    const panel = signAccessToken({
      userId: "aaaaaaaa-1111-4111-8111-111111111111",
      businessId: conversation.businessId,
      role: "OWNER",
    });

    expect(() => verifyConversationToken(panel)).toThrow(
      "Token da conversa inválido ou expirado",
    );
  });

  it("recusa token adulterado", () => {
    const [header, , signature] =
      signConversationToken(conversation).split(".");
    const forged = Buffer.from(
      JSON.stringify({
        ...conversation,
        sub: conversation.customerId,
        businessId: "22222222-2222-4222-8222-222222222222",
        scope: "conversation",
      }),
    ).toString("base64url");

    expect(() =>
      verifyConversationToken(`${header}.${forged}.${signature}`),
    ).toThrow("Token da conversa inválido ou expirado");
  });
});
