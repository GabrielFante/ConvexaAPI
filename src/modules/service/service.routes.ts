import { Router } from "express";
import { serviceController } from "./service.controller";

export const serviceRoutes = Router();

serviceRoutes.get("/services", serviceController.list);
serviceRoutes.post("/services", serviceController.create);
serviceRoutes.get("/services/:id", serviceController.get);
serviceRoutes.patch("/services/:id", serviceController.update);
serviceRoutes.delete("/services/:id", serviceController.delete);
