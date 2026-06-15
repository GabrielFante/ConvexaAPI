import { Router } from "express";
import { customerController } from "./customer.controller";

export const customerRoutes = Router();

customerRoutes.get("/customers", customerController.list);
customerRoutes.post("/customers", customerController.create);
customerRoutes.get("/customers/:id", customerController.get);
customerRoutes.patch("/customers/:id", customerController.update);
customerRoutes.delete("/customers/:id", customerController.delete);
