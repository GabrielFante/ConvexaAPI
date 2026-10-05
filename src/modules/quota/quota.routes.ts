import { Router } from "express";
import { quotaController } from "./quota.controller";

export const quotaInternalRoutes = Router();

quotaInternalRoutes.post("/messages/quota", quotaController.consume);

export const quotaRoutes = Router();

quotaRoutes.get("/messages/usage", quotaController.usage);
