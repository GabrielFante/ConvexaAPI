-- AlterTable
ALTER TABLE "InboundMessage" DROP COLUMN "conversationId";
ALTER TABLE "InboundMessage" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "InboundMessage" ALTER COLUMN "payload" DROP NOT NULL;

-- ClearFinishedContent
UPDATE "InboundMessage"
   SET "phone" = NULL, "contactName" = NULL, "text" = NULL,
       "mediaId" = NULL, "payload" = NULL
 WHERE "status" IN ('DONE', 'DEAD');

-- AddCheck
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_content_check" CHECK (
    "status" IN ('DONE', 'DEAD')
    OR ("phone" IS NOT NULL AND "payload" IS NOT NULL)
);
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_finished_content_check" CHECK (
    "status" NOT IN ('DONE', 'DEAD')
    OR ("phone" IS NULL AND "contactName" IS NULL AND "text" IS NULL
        AND "mediaId" IS NULL AND "payload" IS NULL)
);

-- AlterTable
ALTER TABLE "Business" ADD COLUMN "monthlyMessageLimit" INTEGER;
ALTER TABLE "Business" ADD CONSTRAINT "Business_monthlyMessageLimit_check" CHECK (
    "monthlyMessageLimit" IS NULL OR "monthlyMessageLimit" >= 0
);

-- CreateTable
CREATE TABLE "MessageUsage" (
    "businessId" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

    CONSTRAINT "MessageUsage_pkey" PRIMARY KEY ("businessId", "month"),
    CONSTRAINT "MessageUsage_sent_check" CHECK ("sent" >= 0),
    CONSTRAINT "MessageUsage_month_check" CHECK ("month" ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

-- AddForeignKey
ALTER TABLE "MessageUsage" ADD CONSTRAINT "MessageUsage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EnableRowLevelSecurity
ALTER TABLE "MessageUsage" ENABLE ROW LEVEL SECURITY;
