async function report(error: unknown) {
  if (error instanceof Error && error.name === "InvalidEnvError") {
    console.error(error.message);
    return;
  }

  try {
    const { logger } = await import("./shared/logger/logger.js");
    logger.error("Falha ao iniciar a API", error);
  } catch {
    console.error(error);
  }
}

async function main() {
  try {
    const { start } = await import("./start.js");
    await start();
  } catch (error) {
    await report(error);
    process.exit(1);
  }
}

void main();
