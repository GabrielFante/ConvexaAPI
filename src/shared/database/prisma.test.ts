import { describe, it, expect, vi } from "vitest";
import { AppError } from "../errors/AppError";
import { assertUtcSession } from "./prisma";

const db = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    $queryRaw = db.prisma.$queryRaw;
  },
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {},
}));

describe("assertUtcSession", () => {
  it("passa quando a sessao do banco esta em UTC", async () => {
    db.prisma.$queryRaw.mockResolvedValue([{ timezone: "UTC" }]);

    await expect(assertUtcSession()).resolves.toBeUndefined();
  });

  it("falha quando a sessao esta em outro fuso e diz qual", async () => {
    db.prisma.$queryRaw.mockResolvedValue([{ timezone: "America/Sao_Paulo" }]);

    await expect(assertUtcSession()).rejects.toThrow(AppError);
    await expect(assertUtcSession()).rejects.toThrow(/America\/Sao_Paulo/);
  });

  it("falha quando o banco nao devolve o fuso", async () => {
    db.prisma.$queryRaw.mockResolvedValue([]);

    await expect(assertUtcSession()).rejects.toThrow(AppError);
  });
});
