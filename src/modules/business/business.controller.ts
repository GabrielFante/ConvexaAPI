import type { Request, Response } from "express";
import { idParam } from "../../shared/validation/common";
import { businessService } from "./business.service";
import {
  createBusinessSchema,
  createClosedDaySchema,
  createVacationSchema,
  setBusinessHoursSchema,
  updateBusinessSchema,
} from "./business.schema";

export const businessController = {
  async create(req: Request, res: Response) {
    const data = createBusinessSchema.parse(req.body);
    const business = await businessService.create(data);
    res.status(201).json(business);
  },

  async get(_req: Request, res: Response) {
    const business = await businessService.get();
    res.json(business);
  },

  async update(req: Request, res: Response) {
    const data = updateBusinessSchema.parse(req.body);
    const business = await businessService.update(data);
    res.json(business);
  },

  async delete(_req: Request, res: Response) {
    await businessService.delete();
    res.status(204).send();
  },

  async setHours(req: Request, res: Response) {
    const { hours } = setBusinessHoursSchema.parse(req.body);
    const result = await businessService.setHours(hours);
    res.json(result);
  },

  async listClosedDays(_req: Request, res: Response) {
    const closedDays = await businessService.listClosedDays();
    res.json(closedDays);
  },

  async addClosedDay(req: Request, res: Response) {
    const data = createClosedDaySchema.parse(req.body);
    const closedDay = await businessService.addClosedDay(data);
    res.status(201).json(closedDay);
  },

  async deleteClosedDay(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    await businessService.deleteClosedDay(id);
    res.status(204).send();
  },

  async listVacations(_req: Request, res: Response) {
    const vacations = await businessService.listVacations();
    res.json(vacations);
  },

  async addVacation(req: Request, res: Response) {
    const data = createVacationSchema.parse(req.body);
    const vacation = await businessService.addVacation(data);
    res.status(201).json(vacation);
  },

  async deleteVacation(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    await businessService.deleteVacation(id);
    res.status(204).send();
  },
};
