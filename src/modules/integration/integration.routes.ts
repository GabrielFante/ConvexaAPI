import { Router } from "express";
import { integrationController } from "./integration.controller";

export const integrationInternalRoutes = Router();

integrationInternalRoutes.get(
  "/integrations/by-phone-number-id/:phoneNumberId",
  integrationController.credentials,
);
