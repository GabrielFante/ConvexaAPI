import type { Request, Response } from "express";
import { idParam } from "../../shared/validation/common";
import { conversationService } from "./conversation.service";
import {
  conversationAvailabilitySchema,
  conversationBookSchema,
  conversationRescheduleSchema,
  conversationSessionSchema,
} from "./conversation.schema";

export const conversationController = {
  async createSession(req: Request, res: Response) {
    const data = conversationSessionSchema.parse(req.body);
    const session = await conversationService.createSession(data);
    res.status(201).json(session);
  },

  async listServices(_req: Request, res: Response) {
    const services = await conversationService.listServices();
    res.json(services);
  },

  async availability(req: Request, res: Response) {
    const query = conversationAvailabilitySchema.parse(req.query);
    const availability = await conversationService.availability(query);
    res.json(availability);
  },

  async listAppointments(_req: Request, res: Response) {
    const appointments = await conversationService.listAppointments();
    res.json(appointments);
  },

  async book(req: Request, res: Response) {
    const data = conversationBookSchema.parse(req.body);
    const appointment = await conversationService.book(data);
    res.status(201).json(appointment);
  },

  async cancel(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const appointment = await conversationService.cancel(id);
    res.json(appointment);
  },

  async reschedule(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const data = conversationRescheduleSchema.parse(req.body);
    const appointment = await conversationService.reschedule(id, data);
    res.json(appointment);
  },
};
