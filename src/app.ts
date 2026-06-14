import express from "express";
import cors from "cors";
import { healthRoutes } from "./shared/health/health.routes";
import {
  errorHandler,
  notFoundHandler,
} from "./shared/middleware/errorHandler";

const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
