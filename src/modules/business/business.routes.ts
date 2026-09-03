import { Router } from "express";
import { requireRole } from "../../shared/middleware/auth";
import { businessController } from "./business.controller";

export const businessInternalRoutes = Router();

businessInternalRoutes.get(
  "/tenants/by-phone-number-id/:phoneNumberId",
  businessController.resolveByPhoneNumberId,
);

export const businessRoutes = Router();

businessRoutes.get("/business", businessController.get);
businessRoutes.patch(
  "/business",
  requireRole("OWNER"),
  businessController.update,
);
businessRoutes.delete(
  "/business",
  requireRole("OWNER"),
  businessController.delete,
);

businessRoutes.put("/business/hours", businessController.setHours);

businessRoutes.get("/business/closed-days", businessController.listClosedDays);
businessRoutes.post("/business/closed-days", businessController.addClosedDay);
businessRoutes.delete(
  "/business/closed-days/:id",
  businessController.deleteClosedDay,
);

businessRoutes.get("/business/vacations", businessController.listVacations);
businessRoutes.post("/business/vacations", businessController.addVacation);
businessRoutes.delete(
  "/business/vacations/:id",
  businessController.deleteVacation,
);
