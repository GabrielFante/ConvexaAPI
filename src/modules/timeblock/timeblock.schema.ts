import { z } from "zod";
import { instant, uuid } from "../../shared/validation/common";

export const END_AFTER_START_MESSAGE = "endAt deve ser maior que startAt";

const timeBlockBase = z.object({
  employeeId: uuid.optional(),
  startAt: instant,
  endAt: instant,
  reason: z.string().trim().min(1).optional(),
});

export const createTimeBlockSchema = timeBlockBase.refine(
  (data) => data.startAt < data.endAt,
  { message: END_AFTER_START_MESSAGE, path: ["endAt"] },
);

export const updateTimeBlockSchema = timeBlockBase
  .partial()
  .refine((data) => !data.startAt || !data.endAt || data.startAt < data.endAt, {
    message: END_AFTER_START_MESSAGE,
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
export type UpdateTimeBlockInput = z.infer<typeof updateTimeBlockSchema>;
export type ListTimeBlocksFilter = z.infer<typeof listTimeBlocksSchema>;
