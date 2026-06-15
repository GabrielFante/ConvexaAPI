import express, { Router } from "express";
import cors from "cors";
import { healthRoutes } from "./shared/health/health.routes";
import { tenantMiddleware } from "./shared/middleware/tenant";
import {
  businessPublicRoutes,
  businessRoutes,
} from "./modules/business/business.routes";
import { serviceRoutes } from "./modules/service/service.routes";
import { employeeRoutes } from "./modules/employee/employee.routes";
import { customerRoutes } from "./modules/customer/customer.routes";
import {
  errorHandler,
  notFoundHandler,
} from "./shared/middleware/errorHandler";

const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRoutes);

app.use("/api", businessPublicRoutes);

const apiRoutes = Router();
apiRoutes.use(tenantMiddleware);

apiRoutes.use(businessRoutes);
apiRoutes.use(serviceRoutes);
apiRoutes.use(employeeRoutes);
apiRoutes.use(customerRoutes);

app.use("/api", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
