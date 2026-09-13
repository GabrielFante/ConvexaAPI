import type { Server } from "node:http";
import { env } from "./shared/env";
import { logger } from "./shared/logger/logger";
import { assertUtcSession, prisma } from "./shared/database/prisma";
import { beginShutdown, gracefulShutdown } from "./shared/health/shutdown";
import { app } from "./app";

function handleSignal(server: Server, signal: NodeJS.Signals) {
  if (!beginShutdown()) {
    return;
  }

  void gracefulShutdown({
    server,
    signal,
    disconnect: () => prisma.$disconnect(),
    onForceExit: () => process.exit(1),
  }).then((exitCode) => process.exit(exitCode));
}

async function start() {
  await assertUtcSession();

  const server = app.listen(env.PORT, () => {
    logger.info("API iniciada", { port: env.PORT });
  });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => handleSignal(server, signal));
  }
}

start().catch((error) => {
  logger.error("Falha ao iniciar a API", error);
  process.exit(1);
});
