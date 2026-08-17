import type { Request, Response } from "express";
import { schedulingEngine } from "./scheduling.engine";
import { availabilityQuerySchema } from "./scheduling.schema";

export const schedulingController = {
  async availability(req: Request, res: Response) {
    const query = availabilityQuerySchema.parse(req.query);
    const availability = await schedulingEngine.getAvailability(query);
    res.json(availability);
  },
};
