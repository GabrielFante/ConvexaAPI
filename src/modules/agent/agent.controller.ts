import type { Request, Response } from "express";
import { idParam } from "../../shared/validation/common";
import { agentService } from "./agent.service";
import {
  agentAvailabilitySchema,
  agentBookSchema,
  agentSessionSchema,
} from "./agent.schema";

export const agentController = {
  async createSession(req: Request, res: Response) {
    const data = agentSessionSchema.parse(req.body);
    const session = await agentService.createSession(data);
    res.status(201).json(session);
  },

  async listServices(_req: Request, res: Response) {
    const services = await agentService.listServices();
    res.json(services);
  },

  async availability(req: Request, res: Response) {
    const query = agentAvailabilitySchema.parse(req.query);
    const availability = await agentService.availability(query);
    res.json(availability);
  },

  async listAppointments(_req: Request, res: Response) {
    const appointments = await agentService.listAppointments();
    res.json(appointments);
  },

  async book(req: Request, res: Response) {
    const data = agentBookSchema.parse(req.body);
    const appointment = await agentService.book(data);
    res.status(201).json(appointment);
  },

  async cancel(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const appointment = await agentService.cancel(id);
    res.json(appointment);
  },
};
