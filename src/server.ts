import { env } from "./shared/env";
import { logger } from "./shared/logger/logger";
import { assertUtcSession } from "./shared/database/prisma";
import { app } from "./app";

async function start() {
  await assertUtcSession();

  app.listen(env.PORT, () => {
    logger.info("API iniciada", { port: env.PORT });
  });
}

start().catch((error) => {
  logger.error("Falha ao iniciar a API", error);
  process.exit(1);
});
