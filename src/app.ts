import express, { Router } from "express";
import cors from "cors";
import { healthRoutes } from "./shared/health/health.routes";
import { tenantMiddleware } from "./shared/middleware/tenant";
import {
  errorHandler,
  notFoundHandler,
} from "./shared/middleware/errorHandler";

const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRoutes);

const apiRoutes = Router();
apiRoutes.use(tenantMiddleware);

app.use("/api", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
