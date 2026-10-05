import type { Request, Response } from "express";
import { integrationService } from "./integration.service";
import { integrationPhoneNumberIdParam } from "./integration.schema";

export const integrationController = {
  async credentials(req: Request, res: Response) {
    const { phoneNumberId } = integrationPhoneNumberIdParam.parse(req.params);
    const credentials =
      await integrationService.credentialsByMetaPhoneNumberId(phoneNumberId);
    res.set("Cache-Control", "no-store").json(credentials);
  },
};
