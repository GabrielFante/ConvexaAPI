import { Prisma } from "@prisma/client";
import { hasSqlState, SERIALIZATION_FAILURE } from "./sqlstate";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 20;

function isSerializationConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2034";
  }

  return hasSqlState(error, SERIALIZATION_FAILURE);
}

function backoffFor(attempt: number): number {
  const window = BASE_DELAY_MS * 2 ** (attempt - 1);

  return window * (0.5 + Math.random());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withSerializableRetry<T>(
  run: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isSerializationConflict(error)) {
        throw error;
      }

      await sleep(backoffFor(attempt));
    }
  }
}
