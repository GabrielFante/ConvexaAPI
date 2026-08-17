import type { Request, Response } from "express";
import { idParam } from "../../shared/validation/common";
import { appointmentService } from "./appointment.service";
import {
  createAppointmentSchema,
  listAppointmentsSchema,
  rescheduleAppointmentSchema,
} from "./appointment.schema";

export const appointmentController = {
  async list(req: Request, res: Response) {
    const filter = listAppointmentsSchema.parse(req.query);
    const appointments = await appointmentService.list(filter);
    res.json(appointments);
  },

  async get(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const appointment = await appointmentService.get(id);
    res.json(appointment);
  },

  async create(req: Request, res: Response) {
    const data = createAppointmentSchema.parse(req.body);
    const appointment = await appointmentService.create(data);
    res.status(201).json(appointment);
  },

  async cancel(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const appointment = await appointmentService.cancel(id);
    res.json(appointment);
  },

  async confirm(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const appointment = await appointmentService.confirm(id);
    res.json(appointment);
  },

  async complete(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const appointment = await appointmentService.complete(id);
    res.json(appointment);
  },

  async reschedule(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const data = rescheduleAppointmentSchema.parse(req.body);
    const appointment = await appointmentService.reschedule(id, data);
    res.json(appointment);
  },
};
