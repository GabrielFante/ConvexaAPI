import { env } from "./shared/env";
import { logger } from "./shared/logger/logger";
import { app } from "./app";

app.listen(env.PORT, () => {
  logger.info("API iniciada", { port: env.PORT });
});
