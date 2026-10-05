import { prisma } from "../../shared/database/prisma";

export const integrationRepository = {
  findCredentialsByMetaPhoneNumberId(phoneNumberId: string) {
    return prisma.businessIntegration.findFirst({
      where: { business: { metaPhoneNumberId: phoneNumberId } },
      select: { businessId: true, metaAccessToken: true, metaAppSecret: true },
    });
  },
};
