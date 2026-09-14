import { logger } from "../logger/logger";

export const FORCE_EXIT_MS = 10_000;

let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function beginShutdown(): boolean {
  if (shuttingDown) {
    return false;
  }

  shuttingDown = true;
  return true;
}

export function resetShutdownState(): void {
  shuttingDown = false;
}

type ShutdownDeps = {
  server: { close: (callback: (error?: Error) => void) => unknown };
  disconnect: () => Promise<void>;
  signal: string;
  forceExitMs?: number;
  onForceExit: () => void;
};

export async function gracefulShutdown({
  server,
  disconnect,
  signal,
  forceExitMs = FORCE_EXIT_MS,
  onForceExit,
}: ShutdownDeps): Promise<number> {
  logger.info("Encerrando a API", { signal });

  const forceExit = setTimeout(() => {
    logger.error("Encerramento nao concluiu no prazo", undefined, {
      timeoutMs: forceExitMs,
    });
    onForceExit();
  }, forceExitMs);

  forceExit.unref();

  try {
    const closeError = await new Promise<Error | undefined>((resolve) => {
      server.close((error) => resolve(error));
    });

    if (closeError) {
      logger.error("Falha ao fechar o servidor HTTP", closeError);
    }

    try {
      await disconnect();
    } catch (error) {
      logger.error("Falha ao desconectar do banco", error);
      return 1;
    }

    logger.info("API encerrada");
    return closeError ? 1 : 0;
  } finally {
    clearTimeout(forceExit);
  }
}
