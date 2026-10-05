import { describe, it, expect, vi, beforeEach } from "vitest";
import { PRISMA_TRANSACTION_TIMEOUT_MS, type Env } from "../env";
const poolSpies = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("pg", () => ({
  Pool: class {
    connect = poolSpies.connect;
  },
}));

import {
  APPLICATION_NAME,
  IDLE_IN_TRANSACTION_TIMEOUT_MS,
  POOL_IDLE_TIMEOUT_MS,
  buildPoolConfig,
  createPool,
  sessionSettings,
} from "./pool-config";

const READINESS_TIMEOUT_MS = 3000;
const HEALTHCHECK_INTERVAL_MS = 15_000;

function envWith(overrides: Partial<Env> = {}): Env {
  return {
    DATABASE_URL: "postgresql://convexa:convexa@localhost:5432/convexa",
    DATABASE_POOL_MAX: 5,
    DATABASE_POOL_CONNECTION_TIMEOUT_MS: 2000,
    DATABASE_STATEMENT_TIMEOUT_MS: 3000,
    ...overrides,
  } as Env;
}

beforeEach(() => {
  poolSpies.connect.mockReset();
});

describe("buildPoolConfig", () => {
  it("usa os valores vindos do ambiente", () => {
    const config = buildPoolConfig(
      envWith({
        DATABASE_POOL_MAX: 8,
        DATABASE_POOL_CONNECTION_TIMEOUT_MS: 1500,
      }),
    );

    expect(config.max).toBe(8);
    expect(config.connectionTimeoutMillis).toBe(1500);
    expect(config.connectionString).toBe(
      "postgresql://convexa:convexa@localhost:5432/convexa",
    );
  });

  it("espera menos por conexao do que o healthcheck espera pelo banco", () => {
    const config = buildPoolConfig(envWith());

    expect(config.connectionTimeoutMillis).toBeLessThan(READINESS_TIMEOUT_MS);
  });

  it("mantem a conexao ociosa viva por mais tempo que o intervalo do healthcheck", () => {
    expect(POOL_IDLE_TIMEOUT_MS).toBeGreaterThan(HEALTHCHECK_INTERVAL_MS);
  });
});

describe("sessionSettings", () => {
  it("corta a query antes de a transacao do Prisma desistir", () => {
    const env = envWith();

    expect(env.DATABASE_STATEMENT_TIMEOUT_MS).toBeLessThan(
      PRISMA_TRANSACTION_TIMEOUT_MS,
    );
    expect(sessionSettings(env)).toContain("SET statement_timeout = 3000");
  });

  it("deixa a transacao do Prisma terminar antes de matar a sessao ociosa", () => {
    expect(IDLE_IN_TRANSACTION_TIMEOUT_MS).toBeGreaterThan(
      PRISMA_TRANSACTION_TIMEOUT_MS,
    );
    expect(sessionSettings(envWith())).toContain(
      `SET idle_in_transaction_session_timeout = ${IDLE_IN_TRANSACTION_TIMEOUT_MS}`,
    );
  });

  it("identifica a aplicacao para o pg_stat_activity", () => {
    expect(sessionSettings(envWith())).toContain(
      `SET application_name = '${APPLICATION_NAME}'`,
    );
  });
});

describe("createPool", () => {
  it("aplica os ajustes antes de entregar a conexao, e so uma vez por conexao", async () => {
    const client = { query: vi.fn().mockResolvedValue(undefined) };
    poolSpies.connect.mockResolvedValue(client);

    const pool = createPool(envWith());

    await pool.connect();
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(
      sessionSettings(envWith()).join("; "),
    );

    await pool.connect();
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("repete os ajustes numa conexao fisica diferente", async () => {
    const primeira = { query: vi.fn().mockResolvedValue(undefined) };
    const segunda = { query: vi.fn().mockResolvedValue(undefined) };
    poolSpies.connect
      .mockResolvedValueOnce(primeira)
      .mockResolvedValueOnce(segunda);

    const pool = createPool(envWith());
    await pool.connect();
    await pool.connect();

    expect(segunda.query).toHaveBeenCalledTimes(1);
  });
});

describe("createPool no formato com callback", () => {
  it("entrega a conexao pelo callback, que e como o pool.query chama", async () => {
    const client = {
      query: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    poolSpies.connect.mockResolvedValue(client);

    const pool = createPool(envWith());
    const recebido = await new Promise((resolve, reject) => {
      (
        pool.connect as unknown as (
          cb: (e?: Error, c?: unknown) => void,
        ) => void
      )((error, entregue) => (error ? reject(error) : resolve(entregue)));
    });

    expect(recebido).toBe(client);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("propaga a falha pelo callback em vez de virar rejeicao solta", async () => {
    poolSpies.connect.mockRejectedValue(new Error("sem conexao livre"));

    const pool = createPool(envWith());
    const erro = await new Promise<Error | undefined>((resolve) => {
      (pool.connect as unknown as (cb: (e?: Error) => void) => void)(resolve);
    });

    expect(erro?.message).toBe("sem conexao livre");
  });
});
