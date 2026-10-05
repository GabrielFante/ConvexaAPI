import type { Prisma } from "@prisma/client";
import { prisma } from "../../shared/database/prisma";

export type InboundMessageInput = {
  businessId: string;
  waMessageId: string;
  phoneNumberId: string;
  phone: string;
  contactName: string | null;
  type: string;
  text: string | null;
  mediaId: string | null;
  payload: Record<string, unknown>;
  sentAt: Date;
};

export type ClaimedInboundMessage = {
  id: string;
  leaseId: string;
  businessId: string;
  phoneNumberId: string;
  phone: string;
  contactName: string | null;
  type: string;
  text: string | null;
  mediaId: string | null;
  sentAt: Date;
  conversationId: string;
  attempts: number;
};

export type ClaimOptions = {
  limit: number;
  leaseSeconds: number;
  maxAttempts: number;
  conversationIdleMinutes: number;
};

const LEASE_EXPIRED_ERROR = "Prazo de processamento expirado sem confirmação";

const leased = (id: string, leaseId: string) =>
  ({ id, leaseId, status: "PROCESSING" }) as const;

const releasedLease = { leaseId: null, lockedUntil: null } as const;

export const whatsappRepository = {
  findTenantsByPhoneNumberIds(phoneNumberIds: string[]) {
    return prisma.business.findMany({
      where: { metaPhoneNumberId: { in: phoneNumberIds } },
      select: {
        id: true,
        metaPhoneNumberId: true,
        integration: { select: { metaAppSecret: true } },
      },
    });
  },

  async enqueue(messages: InboundMessageInput[]): Promise<number> {
    if (messages.length === 0) {
      return 0;
    }

    const { count } = await prisma.inboundMessage.createMany({
      data: messages.map((message) => ({
        ...message,
        payload: message.payload as Prisma.InputJsonObject,
      })),
      skipDuplicates: true,
    });

    return count;
  },

  claim({
    limit,
    leaseSeconds,
    maxAttempts,
    conversationIdleMinutes,
  }: ClaimOptions) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "InboundMessage"
           SET "status" = (CASE WHEN "attempts" >= ${maxAttempts}::int
                               THEN 'DEAD' ELSE 'PENDING' END)::"InboundMessageStatus",
               "leaseId" = NULL,
               "lockedUntil" = NULL,
               "availableAt" = now(),
               "lastError" = ${LEASE_EXPIRED_ERROR},
               "updatedAt" = now()
         WHERE "status" = 'PROCESSING'
           AND "lockedUntil" < now()`;

      const claimed = await tx.$queryRaw<ClaimedInboundMessage[]>`
        UPDATE "InboundMessage" AS m
           SET "status" = 'PROCESSING',
               "attempts" = m."attempts" + 1,
               "conversationId" = COALESCE(
                 m."conversationId",
                 (SELECT p."conversationId"
                    FROM "InboundMessage" AS p
                   WHERE p."businessId" = m."businessId"
                     AND p."phone" = m."phone"
                     AND p."conversationId" IS NOT NULL
                     AND (p."sentAt", p."createdAt", p."id")
                       < (m."sentAt", m."createdAt", m."id")
                     AND p."sentAt" >= m."sentAt"
                           - ${conversationIdleMinutes}::int * interval '1 minute'
                   ORDER BY p."sentAt" DESC, p."createdAt" DESC, p."id" DESC
                   LIMIT 1),
                 gen_random_uuid()),
               "leaseId" = gen_random_uuid(),
               "lockedUntil" = now() + ${leaseSeconds}::int * interval '1 second',
               "updatedAt" = now()
         WHERE m."id" IN (
               SELECT c."id"
                 FROM "InboundMessage" AS c
                WHERE c."status" = 'PENDING'
                  AND c."availableAt" <= now()
                  AND NOT EXISTS (
                        SELECT 1
                          FROM "InboundMessage" AS o
                         WHERE o."businessId" = c."businessId"
                           AND o."phone" = c."phone"
                           AND o."status" IN ('PENDING', 'PROCESSING')
                           AND (o."sentAt", o."createdAt", o."id")
                             < (c."sentAt", c."createdAt", c."id"))
                ORDER BY c."sentAt", c."createdAt", c."id"
                LIMIT ${limit}::int
                  FOR UPDATE SKIP LOCKED)
     RETURNING m."id", m."leaseId", m."businessId", m."phoneNumberId",
               m."phone", m."contactName", m."type", m."text", m."mediaId",
               m."sentAt", m."conversationId", m."attempts"`;

      return claimed.sort(
        (a, b) =>
          a.sentAt.getTime() - b.sentAt.getTime() || a.id.localeCompare(b.id),
      );
    });
  },

  findLeased(id: string, leaseId: string) {
    return prisma.inboundMessage.findFirst({
      where: leased(id, leaseId),
      select: { id: true, attempts: true },
    });
  },

  async ack(id: string, leaseId: string): Promise<boolean> {
    const { count } = await prisma.inboundMessage.updateMany({
      where: leased(id, leaseId),
      data: {
        ...releasedLease,
        status: "DONE",
        processedAt: new Date(),
        lastError: null,
      },
    });

    return count > 0;
  },

  async retryLater(
    id: string,
    leaseId: string,
    availableAt: Date,
    error: string,
  ): Promise<boolean> {
    const { count } = await prisma.inboundMessage.updateMany({
      where: leased(id, leaseId),
      data: {
        ...releasedLease,
        status: "PENDING",
        availableAt,
        lastError: error,
      },
    });

    return count > 0;
  },

  async markDead(id: string, leaseId: string, error: string): Promise<boolean> {
    const { count } = await prisma.inboundMessage.updateMany({
      where: leased(id, leaseId),
      data: { ...releasedLease, status: "DEAD", lastError: error },
    });

    return count > 0;
  },
};
