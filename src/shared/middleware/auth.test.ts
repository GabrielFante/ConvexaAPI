import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { signAccessToken } from "../auth/jwt";
import { env } from "../env";
import { AppError } from "../errors/AppError";
import {
  getBusinessId,
  getCurrentUser,
  runWithAuth,
} from "../tenant/tenant-context";
import { authMiddleware, requireRole } from "./auth";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BUSINESS_A = "22222222-2222-4222-8222-222222222222";
const BUSINESS_B = "33333333-3333-4333-8333-333333333333";

function requestWith(authorization?: string): Request {
  return {
    header: (name: string) =>
      name.toLowerCase() === "authorization" ? authorization : undefined,
  } as unknown as Request;
}

const response = {} as Response;

describe("authMiddleware", () => {
  it("recusa requisição sem Authorization", () => {
    expect(() => authMiddleware(requestWith(), response, vi.fn())).toThrow(
      AppError,
    );
  });

  it("recusa esquema diferente de Bearer", () => {
    expect(() =>
      authMiddleware(requestWith("Basic abc"), response, vi.fn()),
    ).toThrow(AppError);
  });

  it("recusa Bearer sem token", () => {
    expect(() =>
      authMiddleware(requestWith("Bearer   "), response, vi.fn()),
    ).toThrow(AppError);
  });

  it("recusa token inválido", () => {
    expect(() =>
      authMiddleware(requestWith("Bearer nao-e-token"), response, vi.fn()),
    ).toThrow(AppError);
  });

  it("responde 401 ao recusar", () => {
    try {
      authMiddleware(requestWith(), response, vi.fn());
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).statusCode).toBe(401);
    }
  });

  it("injeta o usuário e o tenant do token no contexto", () => {
    const token = signAccessToken({
      userId: USER_ID,
      businessId: BUSINESS_A,
      role: "OWNER",
    });
    const next = vi.fn(() => {
      expect(getBusinessId()).toBe(BUSINESS_A);
      expect(getCurrentUser()).toEqual({
        userId: USER_ID,
        businessId: BUSINESS_A,
        role: "OWNER",
      });
    });

    authMiddleware(requestWith(`Bearer ${token}`), response, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("ignora o header x-business-id de outro tenant", () => {
    const token = signAccessToken({
      userId: USER_ID,
      businessId: BUSINESS_A,
      role: "OWNER",
    });
    const request = {
      header: (name: string) =>
        name.toLowerCase() === "authorization" ? `Bearer ${token}` : BUSINESS_B,
    } as unknown as Request;
    const next = vi.fn(() => {
      expect(getBusinessId()).toBe(BUSINESS_A);
    });

    authMiddleware(request, response, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("recusa token assinado com outro segredo", () => {
    const forged = jwt.sign(
      { businessId: BUSINESS_B, role: "OWNER" },
      "segredo-de-atacante-com-tamanho-suficiente",
      { subject: USER_ID, issuer: "convexa-api", audience: "convexa-api" },
    );

    expect(() =>
      authMiddleware(requestWith(`Bearer ${forged}`), response, vi.fn()),
    ).toThrow(AppError);
  });

  it("aceita token emitido com o segredo da aplicação", () => {
    const token = jwt.sign(
      { businessId: BUSINESS_A, role: "STAFF" },
      env.JWT_SECRET,
      { subject: USER_ID, issuer: "convexa-api", audience: "convexa-api" },
    );
    const next = vi.fn();

    authMiddleware(requestWith(`Bearer ${token}`), response, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe("requireRole", () => {
  const staff = {
    userId: USER_ID,
    businessId: BUSINESS_A,
    role: "STAFF",
  } as const;

  const owner = { ...staff, role: "OWNER" } as const;

  it("bloqueia quem não tem o papel exigido", () => {
    runWithAuth(staff, () => {
      expect(() =>
        requireRole("OWNER")({} as Request, response, vi.fn()),
      ).toThrow(AppError);
    });
  });

  it("responde 403 ao bloquear", () => {
    runWithAuth(staff, () => {
      try {
        requireRole("OWNER")({} as Request, response, vi.fn());
        expect.unreachable();
      } catch (error) {
        expect((error as AppError).statusCode).toBe(403);
      }
    });
  });

  it("libera quem tem o papel exigido", () => {
    const next = vi.fn();

    runWithAuth(owner, () => {
      requireRole("OWNER")({} as Request, response, next);
    });

    expect(next).toHaveBeenCalledOnce();
  });

  it("aceita qualquer um dos papéis informados", () => {
    const next = vi.fn();

    runWithAuth(staff, () => {
      requireRole("OWNER", "STAFF")({} as Request, response, next);
    });

    expect(next).toHaveBeenCalledOnce();
  });
});
