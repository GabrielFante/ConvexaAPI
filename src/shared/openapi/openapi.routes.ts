import { Router } from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "./openapi.document";

const document = buildOpenApiDocument();

const docsContentSecurityPolicy = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
  },
});

export const openApiRoutes = Router();

openApiRoutes.get("/docs/openapi.json", (_req, res) => {
  res.json(document);
});

openApiRoutes.use(
  "/docs",
  docsContentSecurityPolicy,
  swaggerUi.serve,
  swaggerUi.setup(document, {
    customSiteTitle: "Convexa API",
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: "none",
      tryItOutEnabled: true,
    },
  }),
);
