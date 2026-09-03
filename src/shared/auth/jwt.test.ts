import { describe, it, expect, afterEach, vi } from "vitest";
import jwt from "jsonwebtoken";
import { env } from "../env";
import { AppError } from "../errors/AppError";
import { signAccessToken, verifyAccessToken } from "./jwt";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";

const user = {
  userId: USER_ID,
  businessId: BUSINESS_ID,
  role: "OWNER",
} as const;

describe("jwt", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("faz round-trip do usuário autenticado", () => {
    expect(verifyAccessToken(signAccessToken(user))).toEqual(user);
  });

  it("recusa token assinado com outro segredo", () => {
    const forged = jwt.sign(
      { businessId: BUSINESS_ID, role: "OWNER" },
      "outro-segredo-qualquer",
      {
        subject: USER_ID,
        issuer: "convexa-api",
        audience: "convexa-api",
      },
    );

    expect(() => verifyAccessToken(forged)).toThrow(AppError);
  });

  it("recusa token adulterado", () => {
    const token = signAccessToken(user);

    expect(() => verifyAccessToken(`${token}x`)).toThrow(AppError);
  });

  it("recusa token expirado", () => {
    const token = signAccessToken(user);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (env.ACCESS_TOKEN_TTL_SECONDS + 60) * 1000);

    expect(() => verifyAccessToken(token)).toThrow(AppError);
  });

  it("recusa token sem o emissor esperado", () => {
    const foreign = jwt.sign(
      { businessId: BUSINESS_ID, role: "OWNER" },
      env.JWT_SECRET,
      { subject: USER_ID, issuer: "outra-api", audience: "outra-api" },
    );

    expect(() => verifyAccessToken(foreign)).toThrow(AppError);
  });

  it("recusa token cujo payload não tem businessId", () => {
    const incomplete = jwt.sign({ role: "OWNER" }, env.JWT_SECRET, {
      subject: USER_ID,
      issuer: "convexa-api",
      audience: "convexa-api",
    });

    expect(() => verifyAccessToken(incomplete)).toThrow(AppError);
  });

  it("responde 401 ao recusar um token", () => {
    try {
      verifyAccessToken("nao-e-um-token");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(401);
    }
  });
});
