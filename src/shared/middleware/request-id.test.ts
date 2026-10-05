import { describe, it, expect, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { app } from "../../app";
import { logger } from "../logger/logger";
import { errorHandler } from "./errorHandler";
import { requestIdMiddleware } from "./request-id";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function failingApp() {
  const failing = express();

  failing.use(requestIdMiddleware);
  failing.get("/falha", async () => {
    logger.warn("antes da falha");
    throw new Error("detalhe interno");
  });
  failing.use(errorHandler);

  return failing;
}

function captureLogs() {
  const linhas: Record<string, unknown>[] = [];
  const push = (arg: unknown) => {
    linhas.push(JSON.parse(String(arg)) as Record<string, unknown>);
  };

  vi.spyOn(console, "log").mockImplementation(push);
  vi.spyOn(console, "error").mockImplementation(push);

  return linhas;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("X-Request-Id", () => {
  it("gera um id quando a requisição não traz", async () => {
    const response = await request(app).get("/health/live");

    expect(response.headers["x-request-id"]).toMatch(UUID);
  });

  it("devolve o id recebido do n8n", async () => {
    const response = await request(app)
      .get("/health/live")
      .set("X-Request-Id", "n8n-exec-4821:node-7");

    expect(response.headers["x-request-id"]).toBe("n8n-exec-4821:node-7");
  });

  it("troca id com caractere fora do permitido por um gerado", async () => {
    const response = await request(app)
      .get("/health/live")
      .set("X-Request-Id", "id com espaço");

    expect(response.headers["x-request-id"]).toMatch(UUID);
  });

  it("troca id acima de 128 caracteres por um gerado", async () => {
    const response = await request(app)
      .get("/health/live")
      .set("X-Request-Id", "a".repeat(129));

    expect(response.headers["x-request-id"]).toMatch(UUID);
  });

  it("expõe o header para o painel via CORS", async () => {
    const response = await request(app)
      .get("/health/live")
      .set("Origin", "http://localhost:5173");

    expect(response.headers["access-control-expose-headers"]).toContain(
      "X-Request-Id",
    );
  });

  it("marca os logs e o corpo do 500 com o mesmo id", async () => {
    const linhas = captureLogs();

    const response = await request(failingApp())
      .get("/falha")
      .set("X-Request-Id", "req-123");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      status: "error",
      code: "INTERNAL_ERROR",
      message: "Erro interno do servidor",
      requestId: "req-123",
    });
    expect(linhas.map((linha) => linha.requestId)).toEqual([
      "req-123",
      "req-123",
    ]);
  });

  it("não marca log emitido fora de uma requisição", () => {
    const linhas = captureLogs();

    logger.info("boot");

    expect(linhas[0]).not.toHaveProperty("requestId");
  });
});
