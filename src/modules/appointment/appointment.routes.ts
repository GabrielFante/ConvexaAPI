import { Router } from "express";
import { appointmentController } from "./appointment.controller";

export const appointmentRoutes = Router();

appointmentRoutes.post("/appointments", appointmentController.create);
appointmentRoutes.post(
  "/appointments/:id/cancel",
  appointmentController.cancel,
);
appointmentRoutes.post(
  "/appointments/:id/confirm",
  appointmentController.confirm,
);
appointmentRoutes.post(
  "/appointments/:id/complete",
  appointmentController.complete,
);
appointmentRoutes.patch(
  "/appointments/:id/reschedule",
  appointmentController.reschedule,
);
