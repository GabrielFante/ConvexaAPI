import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "../env";
import { AppError } from "../errors/AppError";
import { logger } from "../logger/logger";
import { createPool } from "./pool-config";

const pool = createPool(env);

pool.on("error", (error) => {
  logger.error("Erro em conexao ociosa do pool do banco", error);
});

const adapter = new PrismaPg(pool, {
  disposeExternalPool: true,
  onPoolError: (error) => logger.error("Erro no pool do banco", error),
  onConnectionError: (error) =>
    logger.error("Erro ao abrir conexao com o banco", error),
});

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function assertUtcSession(): Promise<void> {
  const [row] = await prisma.$queryRaw<
    { timezone: string }[]
  >`SELECT current_setting('TimeZone') AS timezone`;

  if (row?.timezone !== "UTC") {
    throw new AppError(
      `A sessão do banco precisa estar em UTC, mas está em ${row?.timezone ?? "desconhecido"}`,
      500,
      "DATABASE_TIMEZONE",
    );
  }
}
