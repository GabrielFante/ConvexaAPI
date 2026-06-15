import { z } from "zod";

export const uuid = z.uuid("Identificador inválido");

export const idParam = z.object({ id: uuid });

export const dayOfWeek = z
  .number()
  .int()
  .min(0, "dayOfWeek deve estar entre 0 e 6")
  .max(6, "dayOfWeek deve estar entre 0 e 6");

export const minuteOfDay = z
  .number()
  .int()
  .min(0, "Horário deve estar entre 0 e 1440 minutos")
  .max(1440, "Horário deve estar entre 0 e 1440 minutos");

export const timeRange = z
  .object({ startsAt: minuteOfDay, endsAt: minuteOfDay })
  .refine((data) => data.startsAt < data.endsAt, {
    message: "startsAt deve ser menor que endsAt",
    path: ["endsAt"],
  });
