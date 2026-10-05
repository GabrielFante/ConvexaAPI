import express, { Router } from "express";
import { whatsappController } from "./whatsapp.controller";

export const WHATSAPP_WEBHOOK_PATH = "/whatsapp/webhook";

const rawBody = express.raw({ type: () => true, limit: "512kb" });

export const whatsappInternalRoutes = Router();

whatsappInternalRoutes.get(WHATSAPP_WEBHOOK_PATH, whatsappController.verify);
whatsappInternalRoutes.post(
  WHATSAPP_WEBHOOK_PATH,
  rawBody,
  whatsappController.receive,
);
whatsappInternalRoutes.post(
  "/inbound-messages/claim",
  whatsappController.claim,
);
whatsappInternalRoutes.post(
  "/inbound-messages/:id/ack",
  whatsappController.ack,
);
whatsappInternalRoutes.post(
  "/inbound-messages/:id/fail",
  whatsappController.fail,
);
