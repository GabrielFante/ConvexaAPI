import { Router } from "express";
import { employeeController } from "./employee.controller";

export const employeeRoutes = Router();

employeeRoutes.get("/employees", employeeController.list);
employeeRoutes.post("/employees", employeeController.create);
employeeRoutes.get("/employees/:id", employeeController.get);
employeeRoutes.patch("/employees/:id", employeeController.update);
employeeRoutes.delete("/employees/:id", employeeController.delete);
employeeRoutes.put("/employees/:id/services", employeeController.setServices);
employeeRoutes.put("/employees/:id/hours", employeeController.setHours);
