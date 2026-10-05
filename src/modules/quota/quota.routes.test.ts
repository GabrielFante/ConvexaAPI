import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  repository: {
    findByMetaPhoneNumberId: vi.fn(),
    findCurrent: vi.fn(),
    sentIn: vi.fn(),
    consume: vi.fn(),
  },
}));

vi.mock("./quota.repository", () => ({ quotaRepository: mocks.repository }));

import { app } from "../../app";
import { env } from "../../shared/env";
import { bearer, TENANT_A } from "../../test/http";
import { monthOf } from "./quota.service";

const business = (monthlyMessageLimit: number | null) => ({
  id: TENANT_A,
  timezone: "America/Sao_Paulo",
  monthlyMessageLimit,
});

const consume = (body: Record<string, unknown>) =>
  request(app)
    .post("/internal/messages/quota")
    .set("x-internal-key", env.INTERNAL_API_KEY)
    .send(body);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("monthOf", () => {
  it("usa o mês no fuso da empresa, não o de UTC", () => {
    const instant = new Date("2026-11-01T02:00:00.000Z");

    expect(monthOf(instant, "America/Sao_Paulo")).toBe("2026-10");
    expect(monthOf(instant, "UTC")).toBe("2026-11");
  });
});

describe("POST /internal/messages/quota", () => {
  it("consome a cota da empresa dona do número no mês corrente", async () => {
    mocks.repository.findByMetaPhoneNumberId.mockResolvedValue(business(1000));
    mocks.repository.consume.mockResolvedValue(42);
    const month = monthOf(new Date(), "America/Sao_Paulo");

    const response = await consume({ phoneNumberId: "111111111" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      month,
      sent: 42,
      limit: 1000,
      remaining: 958,
    });
    expect(mocks.repository.consume).toHaveBeenCalledWith({
      businessId: TENANT_A,
      month,
      count: 1,
      limit: 1000,
    });
  });

  it("só conta quando a empresa não tem limite", async () => {
    mocks.repository.findByMetaPhoneNumberId.mockResolvedValue(business(null));
    mocks.repository.consume.mockResolvedValue(7);

    const response = await consume({ phoneNumberId: "111111111", count: 3 });

    expect(response.body).toMatchObject({
      sent: 7,
      limit: null,
      remaining: null,
    });
    expect(mocks.repository.consume).toHaveBeenCalledWith(
      expect.objectContaining({ count: 3, limit: null }),
    );
  });

  it("devolve 402 quando o envio passaria do limite", async () => {
    mocks.repository.findByMetaPhoneNumberId.mockResolvedValue(business(100));
    mocks.repository.consume.mockResolvedValue(undefined);
    mocks.repository.sentIn.mockResolvedValue(100);

    const response = await consume({ phoneNumberId: "111111111" });

    expect(response.status).toBe(402);
    expect(response.body.code).toBe("QUOTA_EXCEEDED");
    expect(response.body.message).toContain("100 de 100");
  });

  it("devolve 404 para número sem empresa", async () => {
    mocks.repository.findByMetaPhoneNumberId.mockResolvedValue(null);

    const response = await consume({ phoneNumberId: "999" });

    expect(response.status).toBe(404);
    expect(mocks.repository.consume).not.toHaveBeenCalled();
  });

  it("recusa count fora do intervalo", async () => {
    const response = await consume({ phoneNumberId: "111111111", count: 0 });

    expect(response.status).toBe(400);
  });

  it("exige a chave interna", async () => {
    const response = await request(app)
      .post("/internal/messages/quota")
      .send({ phoneNumberId: "111111111" });

    expect(response.status).toBe(401);
    expect(mocks.repository.findByMetaPhoneNumberId).not.toHaveBeenCalled();
  });

  it("não aceita token do painel no lugar da chave interna", async () => {
    const response = await request(app)
      .post("/internal/messages/quota")
      .set("authorization", bearer())
      .send({ phoneNumberId: "111111111" });

    expect(response.status).toBe(401);
  });
});

describe("GET /api/messages/usage", () => {
  it("devolve o uso do mês pedido para a empresa do token", async () => {
    mocks.repository.findCurrent.mockResolvedValue(business(500));
    mocks.repository.sentIn.mockResolvedValue(120);

    const response = await request(app)
      .get("/api/messages/usage")
      .query({ month: "2026-09" })
      .set("authorization", bearer());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      month: "2026-09",
      sent: 120,
      limit: 500,
      remaining: 380,
    });
    expect(mocks.repository.sentIn).toHaveBeenCalledWith(TENANT_A, "2026-09");
  });

  it("nunca devolve remaining negativo", async () => {
    mocks.repository.findCurrent.mockResolvedValue(business(10));
    mocks.repository.sentIn.mockResolvedValue(15);

    const response = await request(app)
      .get("/api/messages/usage")
      .set("authorization", bearer());

    expect(response.body.remaining).toBe(0);
  });

  it("recusa mês malformado", async () => {
    const response = await request(app)
      .get("/api/messages/usage")
      .query({ month: "2026-13" })
      .set("authorization", bearer());

    expect(response.status).toBe(400);
  });

  it("exige o token do painel", async () => {
    const response = await request(app).get("/api/messages/usage");

    expect(response.status).toBe(401);
  });
});
