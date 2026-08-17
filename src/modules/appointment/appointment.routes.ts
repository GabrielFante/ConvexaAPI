import { Router } from "express";
import { appointmentController } from "./appointment.controller";

export const appointmentRoutes = Router();

appointmentRoutes.post("/appointments", appointmentController.create);
