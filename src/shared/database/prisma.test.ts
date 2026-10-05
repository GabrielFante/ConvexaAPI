import { describe, it, expect, vi } from "vitest";
import { AppError } from "../errors/AppError";
import { env } from "../env";
import { buildPoolConfig } from "./pool-config";
import { assertUtcSession } from "./prisma";

const db = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn() },
  adapterArgs: [] as unknown[][],
  poolConfig: [] as unknown[],
  poolHandlers: new Map<string, (arg: unknown) => void>(),
  poolInstance: undefined as unknown,
}));

vi.mock("pg", () => ({
  Pool: class {
    constructor(config: unknown) {
      db.poolConfig.push(config);
      db.poolInstance = this;
    }
    connect = async () => ({ query: async () => undefined });
    on(event: string, handler: (arg: unknown) => void) {
      db.poolHandlers.set(event, handler);
    }
  },
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    $queryRaw = db.prisma.$queryRaw;
  },
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    constructor(...args: unknown[]) {
      db.adapterArgs.push(args);
    }
  },
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

describe("configuracao do pool", () => {
  it("entrega ao adapter o pool ajustado, nao a connection string crua", () => {
    expect(db.adapterArgs[0]?.[0]).toBe(db.poolInstance);
    expect(db.poolConfig[0]).toEqual(buildPoolConfig(env));
  });

  it("registra tratador de erro de conexao ociosa para nao derrubar o processo", () => {
    expect(db.poolHandlers.has("error")).toBe(true);
  });

  it("avisa o adapter sobre falha de pool e de conexao", () => {
    const options = db.adapterArgs[0]?.[1] as Record<string, unknown>;

    expect(typeof options.onPoolError).toBe("function");
    expect(typeof options.onConnectionError).toBe("function");
    expect(options.disposeExternalPool).toBe(true);
  });
});
