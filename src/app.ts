import express, { Router } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { docsEnabled, env } from "./shared/env";
import { AppError } from "./shared/errors/AppError";
import { healthRoutes } from "./shared/health/health.routes";
import { openApiRoutes } from "./shared/openapi/openapi.routes";
import { authMiddleware } from "./shared/middleware/auth";
import { internalKeyMiddleware } from "./shared/middleware/internal-key";
import {
  authPrivateRoutes,
  authPublicRoutes,
} from "./modules/auth/auth.routes";
import {
  businessInternalRoutes,
  businessRoutes,
} from "./modules/business/business.routes";
import { serviceRoutes } from "./modules/service/service.routes";
import { employeeRoutes } from "./modules/employee/employee.routes";
import { customerRoutes } from "./modules/customer/customer.routes";
import { timeBlockRoutes } from "./modules/timeblock/timeblock.routes";
import { appointmentRoutes } from "./modules/appointment/appointment.routes";
import { schedulingRoutes } from "./modules/scheduling/scheduling.routes";
import {
  errorHandler,
  notFoundHandler,
} from "./shared/middleware/errorHandler";

const app = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(cors(env.CORS_ORIGINS.length > 0 ? { origin: env.CORS_ORIGINS } : {}));
app.use(express.json({ limit: "100kb" }));

app.use(healthRoutes);

if (docsEnabled(env)) {
  app.use(openApiRoutes);
}

const createRateLimit = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    handler: (_req, _res, next) => next(new AppError(message, 429)),
  });

const TOO_MANY_REQUESTS =
  "Muitas requisições. Aguarde alguns minutos e tente novamente";

const authRateLimit = createRateLimit(
  15 * 60 * 1000,
  20,
  "Muitas tentativas. Aguarde alguns minutos e tente novamente",
);

const passwordResetRateLimit = createRateLimit(
  60 * 60 * 1000,
  5,
  "Muitos pedidos de redefinição de senha. Tente novamente mais tarde",
);

const apiRateLimit = createRateLimit(15 * 60 * 1000, 300, TOO_MANY_REQUESTS);

const internalRateLimit = createRateLimit(60 * 1000, 600, TOO_MANY_REQUESTS);

app.use("/api/auth/forgot-password", passwordResetRateLimit);
app.use("/api/auth", authRateLimit, authPublicRoutes);
app.use(
  "/internal",
  internalRateLimit,
  internalKeyMiddleware,
  businessInternalRoutes,
);

const apiRoutes = Router();
apiRoutes.use(apiRateLimit);
apiRoutes.use(authMiddleware);

apiRoutes.use("/auth", authPrivateRoutes);
apiRoutes.use(businessRoutes);
apiRoutes.use(serviceRoutes);
apiRoutes.use(employeeRoutes);
apiRoutes.use(customerRoutes);
apiRoutes.use(timeBlockRoutes);
apiRoutes.use(appointmentRoutes);
apiRoutes.use(schedulingRoutes);

app.use("/api", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
