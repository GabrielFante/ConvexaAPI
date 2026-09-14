import { Router } from "express";
import { timeBlockController } from "./timeblock.controller";

export const timeBlockRoutes = Router();

timeBlockRoutes.get("/time-blocks", timeBlockController.list);
timeBlockRoutes.post("/time-blocks", timeBlockController.create);
timeBlockRoutes.get("/time-blocks/:id", timeBlockController.get);
timeBlockRoutes.patch("/time-blocks/:id", timeBlockController.update);
timeBlockRoutes.delete("/time-blocks/:id", timeBlockController.delete);
