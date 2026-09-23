import { AppError } from "../errors/AppError";
import { ExternalServiceError } from "../errors/ExternalServiceError";
import { logger } from "../logger/logger";

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BASE_DELAY_MS = 250;
export const DEFAULT_MAX_DELAY_MS = 2000;

const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

type WithRetryOptions = {
  service: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  isRetryable?: (error: unknown) => boolean;
};

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUS.has(status);
}

export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }

  const date = /[a-z]/i.test(trimmed) ? Date.parse(trimmed) : Number.NaN;

  if (Number.isNaN(date)) {
    return undefined;
  }

  return Math.max(0, date - now);
}

export function isTransientError(error: unknown): boolean {
  if (error instanceof ExternalServiceError) {
    return error.retryable;
  }

  return error instanceof AppError && error.code === "EXTERNAL_TIMEOUT";
}

function backoffFor(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const window = baseDelayMs * 2 ** (attempt - 1);

  return Math.min(maxDelayMs, window * (0.5 + Math.random()));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  run: (attempt: number) => Promise<T>,
  {
    service,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    isRetryable = isTransientError,
  }: WithRetryOptions,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run(attempt);
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryable(error)) {
        throw error;
      }

      const retryAfterMs =
        error instanceof ExternalServiceError ? error.retryAfterMs : undefined;

      if (retryAfterMs !== undefined && retryAfterMs > maxDelayMs) {
        throw error;
      }

      const delayMs =
        retryAfterMs ?? backoffFor(attempt, baseDelayMs, maxDelayMs);

      logger.warn(`${service} falhou; nova tentativa agendada`, {
        service,
        attempt,
        delayMs: Math.round(delayMs),
        status: error instanceof ExternalServiceError ? error.status : null,
      });

      await sleep(delayMs);
    }
  }
}
