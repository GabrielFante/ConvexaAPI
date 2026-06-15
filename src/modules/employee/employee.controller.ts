import type { Request, Response } from "express";
import { idParam } from "../../shared/validation/common";
import { employeeService } from "./employee.service";
import {
  createEmployeeSchema,
  setEmployeeHoursSchema,
  setEmployeeServicesSchema,
  updateEmployeeSchema,
} from "./employee.schema";

export const employeeController = {
  async list(_req: Request, res: Response) {
    const employees = await employeeService.list();
    res.json(employees);
  },

  async get(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const employee = await employeeService.get(id);
    res.json(employee);
  },

  async create(req: Request, res: Response) {
    const data = createEmployeeSchema.parse(req.body);
    const employee = await employeeService.create(data);
    res.status(201).json(employee);
  },

  async update(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const data = updateEmployeeSchema.parse(req.body);
    const employee = await employeeService.update(id, data);
    res.json(employee);
  },

  async setServices(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const { serviceIds } = setEmployeeServicesSchema.parse(req.body);
    const employee = await employeeService.setServices(id, serviceIds);
    res.json(employee);
  },

  async setHours(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const { hours } = setEmployeeHoursSchema.parse(req.body);
    const employee = await employeeService.setHours(id, hours);
    res.json(employee);
  },

  async delete(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    await employeeService.delete(id);
    res.status(204).send();
  },
};
