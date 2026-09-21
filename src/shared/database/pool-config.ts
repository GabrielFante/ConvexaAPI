import { Pool, type PoolClient, type PoolConfig } from "pg";
import { PRISMA_TRANSACTION_TIMEOUT_MS, type Env } from "../env";

export const APPLICATION_NAME = "convexa-api";

export const POOL_IDLE_TIMEOUT_MS = 30_000;

export const IDLE_IN_TRANSACTION_TIMEOUT_MS = PRISMA_TRANSACTION_TIMEOUT_MS * 2;

export function buildPoolConfig(env: Env): PoolConfig {
  return {
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    connectionTimeoutMillis: env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
  };
}

export function sessionSettings(env: Env): string[] {
  return [
    `SET statement_timeout = ${env.DATABASE_STATEMENT_TIMEOUT_MS}`,
    `SET idle_in_transaction_session_timeout = ${IDLE_IN_TRANSACTION_TIMEOUT_MS}`,
    `SET application_name = '${APPLICATION_NAME}'`,
  ];
}

export function createPool(env: Env): Pool {
  const pool = new Pool(buildPoolConfig(env));
  const statements = sessionSettings(env).join("; ");
  const adjusted = new WeakSet<PoolClient>();
  const acquire = pool.connect.bind(pool);

  const adjustedClient = async (): Promise<PoolClient> => {
    const client = await acquire();

    if (!adjusted.has(client)) {
      await client.query(statements);
      adjusted.add(client);
    }

    return client;
  };

  pool.connect = ((
    callback?: (
      error: Error | undefined,
      client?: PoolClient,
      release?: (removeClient?: boolean) => void,
    ) => void,
  ) => {
    if (!callback) {
      return adjustedClient();
    }

    adjustedClient().then(
      (client) => callback(undefined, client, client.release.bind(client)),
      (error: Error) => callback(error),
    );

    return undefined;
  }) as typeof pool.connect;

  return pool;
}
