import type { Request, Response } from "express";
import { idParam } from "../../shared/validation/common";
import { customerService } from "./customer.service";
import { createCustomerSchema, updateCustomerSchema } from "./customer.schema";

export const customerController = {
  async list(_req: Request, res: Response) {
    const customers = await customerService.list();
    res.json(customers);
  },

  async get(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const customer = await customerService.get(id);
    res.json(customer);
  },

  async create(req: Request, res: Response) {
    const data = createCustomerSchema.parse(req.body);
    const customer = await customerService.create(data);
    res.status(201).json(customer);
  },

  async update(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const data = updateCustomerSchema.parse(req.body);
    const customer = await customerService.update(id, data);
    res.json(customer);
  },

  async delete(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    await customerService.delete(id);
    res.status(204).send();
  },
};
