import type { Request, Response } from "express";
import { quotaService } from "./quota.service";
import { consumeQuotaSchema, usageQuerySchema } from "./quota.schema";

export const quotaController = {
  async consume(req: Request, res: Response) {
    const data = consumeQuotaSchema.parse(req.body);
    const usage = await quotaService.consume(data);
    res.json(usage);
  },

  async usage(req: Request, res: Response) {
    const query = usageQuerySchema.parse(req.query);
    const usage = await quotaService.usage(query);
    res.json(usage);
  },
};
