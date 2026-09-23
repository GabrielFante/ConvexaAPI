import { Router } from "express";
import { agentController } from "./agent.controller";

export const agentInternalRoutes = Router();

agentInternalRoutes.post("/agent-sessions", agentController.createSession);

export const agentRoutes = Router();

agentRoutes.get("/services", agentController.listServices);
agentRoutes.get("/availability", agentController.availability);
agentRoutes.get("/appointments", agentController.listAppointments);
agentRoutes.post("/appointments", agentController.book);
agentRoutes.post("/appointments/:id/cancel", agentController.cancel);
