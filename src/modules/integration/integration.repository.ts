import { prisma } from "../../shared/database/prisma";
import { decryptMetaCredentials } from "./meta-credentials";

export const integrationRepository = {
  async findCredentialsByMetaPhoneNumberId(phoneNumberId: string) {
    const integration = await prisma.businessIntegration.findFirst({
      where: { business: { metaPhoneNumberId: phoneNumberId } },
      select: { businessId: true, metaAccessToken: true, metaAppSecret: true },
    });

    if (!integration) {
      return null;
    }

    return {
      businessId: integration.businessId,
      ...decryptMetaCredentials(integration.businessId, integration),
    };
  },
};
