import { Router } from "express";
import { conversationController } from "./conversation.controller";

export const conversationSessionRoutes = Router();

conversationSessionRoutes.post(
  "/conversation/session",
  conversationController.createSession,
);

export const conversationRoutes = Router();

conversationRoutes.get("/services", conversationController.listServices);
conversationRoutes.get("/availability", conversationController.availability);
conversationRoutes.get(
  "/appointments",
  conversationController.listAppointments,
);
conversationRoutes.post("/appointments", conversationController.book);
conversationRoutes.post(
  "/appointments/:id/cancel",
  conversationController.cancel,
);
conversationRoutes.post(
  "/appointments/:id/reschedule",
  conversationController.reschedule,
);
