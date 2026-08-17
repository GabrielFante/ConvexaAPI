import { z } from "zod";
import { instant, uuid } from "../../shared/validation/common";

export const createTimeBlockSchema = z
  .object({
    employeeId: uuid.optional(),
    startAt: instant,
    endAt: instant,
    reason: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.startAt < data.endAt, {
    message: "endAt deve ser maior que startAt",
    path: ["endAt"],
  });

export const listTimeBlocksSchema = z
  .object({
    employeeId: uuid.optional(),
    from: instant.optional(),
    to: instant.optional(),
  })
  .refine((data) => !data.from || !data.to || data.from < data.to, {
    message: "to deve ser maior que from",
    path: ["to"],
  });

export type CreateTimeBlockInput = z.infer<typeof createTimeBlockSchema>;
export type ListTimeBlocksFilter = z.infer<typeof listTimeBlocksSchema>;
