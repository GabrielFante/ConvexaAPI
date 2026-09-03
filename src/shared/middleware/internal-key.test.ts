import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { env } from "../env";
import { AppError } from "../errors/AppError";
import { internalKeyMiddleware } from "./internal-key";

function requestWith(key?: string): Request {
  return {
    header: (name: string) =>
      name.toLowerCase() === "x-internal-key" ? key : undefined,
  } as unknown as Request;
}

const response = {} as Response;

describe("internalKeyMiddleware", () => {
  it("recusa quando a chave está ausente", () => {
    const next = vi.fn();

    expect(() => internalKeyMiddleware(requestWith(), response, next)).toThrow(
      AppError,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("recusa chave errada do mesmo tamanho", () => {
    const next = vi.fn();
    const wrong = "x".repeat(env.INTERNAL_API_KEY.length);

    expect(() =>
      internalKeyMiddleware(requestWith(wrong), response, next),
    ).toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });

  it("recusa chave errada de tamanho diferente", () => {
    const next = vi.fn();

    expect(() =>
      internalKeyMiddleware(requestWith("curta"), response, next),
    ).toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });

  it("responde 401 ao recusar", () => {
    try {
      internalKeyMiddleware(requestWith(), response, vi.fn());
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).statusCode).toBe(401);
    }
  });

  it("segue adiante com a chave correta", () => {
    const next = vi.fn();

    internalKeyMiddleware(requestWith(env.INTERNAL_API_KEY), response, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
