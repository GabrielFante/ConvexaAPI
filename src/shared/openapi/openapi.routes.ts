import { Router } from "express";
import type { RequestHandler } from "express";
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

const serveDocument: RequestHandler = (req, res) => {
  res.json({
    ...document,
    servers: [
      {
        url: `${req.protocol}://${req.get("host")}`,
        description: "Servidor atual",
      },
    ],
  });
};

export const openApiRoutes = Router();

openApiRoutes.get("/docs/openapi.json", serveDocument);

export const openApiInternalRoutes = Router();

openApiInternalRoutes.get("/docs/openapi.json", serveDocument);

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
