import { AppError } from "../../shared/errors/AppError";
import { integrationRepository } from "./integration.repository";

export const integrationService = {
  async credentialsByMetaPhoneNumberId(phoneNumberId: string) {
    const integration =
      await integrationRepository.findCredentialsByMetaPhoneNumberId(
        phoneNumberId,
      );

    if (!integration?.metaAccessToken) {
      throw new AppError("Integração da Meta não encontrada", 404);
    }

    return {
      businessId: integration.businessId,
      metaAccessToken: integration.metaAccessToken,
      metaAppSecret: integration.metaAppSecret,
    };
  },
};
