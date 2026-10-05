-- CreateEnum
CREATE TYPE "InboundMessageStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'DEAD');

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "businessId" UUID NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "contactName" TEXT,
    "type" TEXT NOT NULL,
    "text" TEXT,
    "mediaId" TEXT,
    "payload" JSONB NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "InboundMessageStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "leaseId" UUID,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

    CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InboundMessage_attempts_check" CHECK ("attempts" >= 0),
    CONSTRAINT "InboundMessage_lease_check" CHECK (
        ("status" = 'PROCESSING') = ("leaseId" IS NOT NULL AND "lockedUntil" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_waMessageId_key" ON "InboundMessage"("waMessageId");

-- CreateIndex
CREATE INDEX "InboundMessage_status_availableAt_idx" ON "InboundMessage"("status", "availableAt");

-- CreateIndex
CREATE INDEX "InboundMessage_businessId_phone_sentAt_idx" ON "InboundMessage"("businessId", "phone", "sentAt");

-- AddForeignKey
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EnableRowLevelSecurity
ALTER TABLE "InboundMessage" ENABLE ROW LEVEL SECURITY;
