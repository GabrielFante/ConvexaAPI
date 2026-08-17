import { Router } from "express";
import { appointmentController } from "./appointment.controller";

export const appointmentRoutes = Router();

appointmentRoutes.post("/appointments", appointmentController.create);
appointmentRoutes.post(
  "/appointments/:id/cancel",
  appointmentController.cancel,
);
appointmentRoutes.patch(
  "/appointments/:id/reschedule",
  appointmentController.reschedule,
);
