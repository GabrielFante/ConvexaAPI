import { AppError } from "../errors/AppError";

export const DEFAULT_EXTERNAL_TIMEOUT_MS = 5000;

type WithTimeoutOptions = {
  service: string;
  timeoutMs?: number;
};

export async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  { service, timeoutMs = DEFAULT_EXTERNAL_TIMEOUT_MS }: WithTimeoutOptions,
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new AppError(
          `${service} não respondeu em ${timeoutMs}ms`,
          503,
          "EXTERNAL_TIMEOUT",
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
