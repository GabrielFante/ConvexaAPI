import { Router } from "express";
import { schedulingController } from "./scheduling.controller";

export const schedulingRoutes = Router();

schedulingRoutes.get("/availability", schedulingController.availability);
