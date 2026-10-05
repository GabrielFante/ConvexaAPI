import type { Request, Response } from "express";
import { AppError } from "../../shared/errors/AppError";
import { idParam } from "../../shared/validation/common";
import { whatsappService } from "./whatsapp.service";
import {
  ackInboundSchema,
  claimInboundSchema,
  failInboundSchema,
  webhookVerificationSchema,
} from "./whatsapp.schema";

function rawBodyOf(req: Request): Buffer {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new AppError("Corpo do webhook ausente", 400, "INVALID_PAYLOAD");
  }

  return req.body;
}

export const whatsappController = {
  verify(req: Request, res: Response) {
    const query = webhookVerificationSchema.parse(req.query);
    const challenge = whatsappService.verifySubscription(query);
    res.type("text/plain").send(challenge);
  },

  async receive(req: Request, res: Response) {
    const receipt = await whatsappService.receive(
      rawBodyOf(req),
      req.header("x-hub-signature-256"),
    );
    res.json(receipt);
  },

  async claim(req: Request, res: Response) {
    const data = claimInboundSchema.parse(req.body ?? {});
    const claimed = await whatsappService.claim(data);
    res.json(claimed);
  },

  async ack(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const data = ackInboundSchema.parse(req.body);
    await whatsappService.ack(id, data);
    res.status(204).send();
  },

  async fail(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const data = failInboundSchema.parse(req.body);
    const result = await whatsappService.fail(id, data);
    res.json(result);
  },
};
