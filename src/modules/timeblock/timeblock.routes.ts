import { Router } from "express";
import { timeBlockController } from "./timeblock.controller";

export const timeBlockRoutes = Router();

timeBlockRoutes.get("/time-blocks", timeBlockController.list);
timeBlockRoutes.post("/time-blocks", timeBlockController.create);
timeBlockRoutes.delete("/time-blocks/:id", timeBlockController.delete);
