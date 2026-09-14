import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { beginShutdown, resetShutdownState } from "./shutdown";

const db = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock("../database/prisma", () => ({ prisma: db.prisma }));

beforeEach(() => {
  resetShutdownState();
  db.prisma.$queryRaw.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /health/live", () => {
  it("responde 200 sem tocar no banco", async () => {
    const response = await request(app).get("/health/live");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(db.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("mantem /health respondendo como o live", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(db.prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("GET /health/ready", () => {
  it("responde 200 quando o banco responde", async () => {
    db.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(db.prisma.$queryRaw).toHaveBeenCalled();
  });

  it("responde 503 quando o banco falha", async () => {
    db.prisma.$queryRaw.mockRejectedValue(
      new Error("connect ECONNREFUSED 127.0.0.1:9999"),
    );

    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "unavailable",
      code: "DATABASE_UNAVAILABLE",
    });
  });

  it("nao vaza detalhe do driver no corpo do 503", async () => {
    db.prisma.$queryRaw.mockRejectedValue(
      new Error("connect ECONNREFUSED 127.0.0.1:9999"),
    );

    const response = await request(app).get("/health/ready");

    expect(JSON.stringify(response.body)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(response.body)).not.toContain("127.0.0.1");
  });

  it("responde 503 enquanto a app esta encerrando", async () => {
    db.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    beginShutdown();

    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("SHUTTING_DOWN");
    expect(db.prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
