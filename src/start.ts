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

export async function start() {
  await assertUtcSession();

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info("API iniciada", { host: env.HOST, port: env.PORT });
  });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => handleSignal(server, signal));
  }
}
