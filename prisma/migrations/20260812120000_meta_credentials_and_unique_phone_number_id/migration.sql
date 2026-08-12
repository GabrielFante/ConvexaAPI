ALTER TABLE "Business" ADD COLUMN "metaWabaId" TEXT;
ALTER TABLE "Business" ADD COLUMN "metaAppSecret" TEXT;

CREATE UNIQUE INDEX "Business_metaPhoneNumberId_key" ON "Business"("metaPhoneNumberId");
