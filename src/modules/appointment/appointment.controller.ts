import type { Request, Response } from "express";
import { appointmentService } from "./appointment.service";
import { createAppointmentSchema } from "./appointment.schema";

export const appointmentController = {
  async create(req: Request, res: Response) {
    const data = createAppointmentSchema.parse(req.body);
    const appointment = await appointmentService.create(data);
    res.status(201).json(appointment);
  },
};
