import { describe, it, expect, beforeEach, vi } from "vitest";
import { runWithTenant } from "../../shared/tenant/tenant-context";
import { quotaRepository } from "./quota.repository";

const TENANT = "11111111-1111-4111-8111-111111111111";

const db = vi.hoisted(() => ({
  business: { findFirst: vi.fn(), findUnique: vi.fn() },
  messageUsage: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock("../../shared/database/prisma", () => ({ prisma: db }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("quotaRepository", () => {
  it("lê a empresa do token, nunca outra", async () => {
    db.business.findFirst.mockResolvedValue(null);

    await runWithTenant(TENANT, () => quotaRepository.findCurrent());

    expect(db.business.findFirst).toHaveBeenCalledWith({
      where: { id: TENANT },
      select: { id: true, timezone: true, monthlyMessageLimit: true },
    });
  });

  it("não lê credencial da Meta ao resolver pelo número", async () => {
    db.business.findUnique.mockResolvedValue(null);

    await quotaRepository.findByMetaPhoneNumberId("111");

    const [args] = db.business.findUnique.mock.calls[0];
    expect(Object.keys(args.select).sort()).toEqual([
      "id",
      "monthlyMessageLimit",
      "timezone",
    ]);
  });

  it("filtra o uso por empresa e mês", async () => {
    db.messageUsage.findFirst.mockResolvedValue({ sent: 9 });

    await expect(quotaRepository.sentIn(TENANT, "2026-10")).resolves.toBe(9);
    expect(db.messageUsage.findFirst).toHaveBeenCalledWith({
      where: { businessId: TENANT, month: "2026-10" },
      select: { sent: true },
    });
  });

  it("devolve zero quando o mês ainda não tem envio", async () => {
    db.messageUsage.findFirst.mockResolvedValue(null);

    await expect(quotaRepository.sentIn(TENANT, "2026-10")).resolves.toBe(0);
  });

  it("devolve undefined quando o upsert condicional não grava nada", async () => {
    db.$queryRaw.mockResolvedValue([]);

    await expect(
      quotaRepository.consume({
        businessId: TENANT,
        month: "2026-10",
        count: 1,
        limit: 10,
      }),
    ).resolves.toBeUndefined();
  });
});
