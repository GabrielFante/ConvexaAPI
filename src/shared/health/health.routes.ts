import { Router } from "express";
import { prisma } from "../database/prisma";
import { logger } from "../logger/logger";
import { isShuttingDown } from "./shutdown";

const READINESS_TIMEOUT_MS = 3000;

export const healthRoutes = Router();

function liveBody() {
  return {
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}

async function pingDatabase(): Promise<void> {
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("banco nao respondeu no prazo")),
      READINESS_TIMEOUT_MS,
    );
  });

  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

healthRoutes.get("/health", (_req, res) => {
  res.status(200).json(liveBody());
});

healthRoutes.get("/health/live", (_req, res) => {
  res.status(200).json(liveBody());
});

healthRoutes.get("/health/ready", async (_req, res) => {
  if (isShuttingDown()) {
    res.status(503).json({ status: "unavailable", code: "SHUTTING_DOWN" });
    return;
  }

  try {
    await pingDatabase();
    res.status(200).json({ status: "ok" });
  } catch (error) {
    logger.error("Health check de prontidao falhou", error);
    res
      .status(503)
      .json({ status: "unavailable", code: "DATABASE_UNAVAILABLE" });
  }
});
