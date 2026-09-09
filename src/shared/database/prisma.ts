import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "../env";
import { AppError } from "../errors/AppError";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

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
