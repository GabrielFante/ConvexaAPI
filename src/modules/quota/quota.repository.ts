import { prisma } from "../../shared/database/prisma";
import { getBusinessId } from "../../shared/tenant/tenant-context";

const quotaFields = {
  id: true,
  timezone: true,
  monthlyMessageLimit: true,
} as const;

export type ConsumeOptions = {
  businessId: string;
  month: string;
  count: number;
  limit: number | null;
};

export const quotaRepository = {
  findByMetaPhoneNumberId(phoneNumberId: string) {
    return prisma.business.findUnique({
      where: { metaPhoneNumberId: phoneNumberId },
      select: quotaFields,
    });
  },

  findCurrent() {
    return prisma.business.findFirst({
      where: { id: getBusinessId() },
      select: quotaFields,
    });
  },

  async sentIn(businessId: string, month: string): Promise<number> {
    const usage = await prisma.messageUsage.findFirst({
      where: { businessId, month },
      select: { sent: true },
    });

    return usage?.sent ?? 0;
  },

  async consume({
    businessId,
    month,
    count,
    limit,
  }: ConsumeOptions): Promise<number | undefined> {
    const [row] = await prisma.$queryRaw<{ sent: number }[]>`
      INSERT INTO "MessageUsage" ("businessId", "month", "sent", "updatedAt")
      SELECT ${businessId}::uuid, ${month}, ${count}::int, now()
       WHERE ${limit}::int IS NULL OR ${count}::int <= ${limit}::int
      ON CONFLICT ("businessId", "month") DO UPDATE
         SET "sent" = "MessageUsage"."sent" + EXCLUDED."sent",
             "updatedAt" = now()
       WHERE ${limit}::int IS NULL
          OR "MessageUsage"."sent" + EXCLUDED."sent" <= ${limit}::int
      RETURNING "sent"`;

    return row?.sent;
  },
};
