import type { Request, Response } from "express";
import { idParam } from "../../shared/validation/common";
import { serviceService } from "./service.service";
import { createServiceSchema, updateServiceSchema } from "./service.schema";

export const serviceController = {
  async list(_req: Request, res: Response) {
    const services = await serviceService.list();
    res.json(services);
  },

  async get(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const service = await serviceService.get(id);
    res.json(service);
  },

  async create(req: Request, res: Response) {
    const data = createServiceSchema.parse(req.body);
    const service = await serviceService.create(data);
    res.status(201).json(service);
  },

  async update(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const data = updateServiceSchema.parse(req.body);
    const service = await serviceService.update(id, data);
    res.json(service);
  },

  async delete(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    await serviceService.delete(id);
    res.status(204).send();
  },
};
