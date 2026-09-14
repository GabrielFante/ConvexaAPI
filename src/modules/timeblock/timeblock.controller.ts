import type { Request, Response } from "express";
import { idParam } from "../../shared/validation/common";
import { timeBlockService } from "./timeblock.service";
import {
  createTimeBlockSchema,
  listTimeBlocksSchema,
  updateTimeBlockSchema,
} from "./timeblock.schema";

export const timeBlockController = {
  async list(req: Request, res: Response) {
    const filter = listTimeBlocksSchema.parse(req.query);
    const timeBlocks = await timeBlockService.list(filter);
    res.json(timeBlocks);
  },

  async get(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const timeBlock = await timeBlockService.get(id);
    res.json(timeBlock);
  },

  async create(req: Request, res: Response) {
    const data = createTimeBlockSchema.parse(req.body);
    const timeBlock = await timeBlockService.create(data);
    res.status(201).json(timeBlock);
  },

  async update(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    const data = updateTimeBlockSchema.parse(req.body);
    const timeBlock = await timeBlockService.update(id, data);
    res.json(timeBlock);
  },

  async delete(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    await timeBlockService.delete(id);
    res.status(204).send();
  },
};
