import { describe, it, expect } from "vitest";
import request from "supertest";
import type { Router } from "express";
import { app } from "../../app";
import {
  authPrivateRoutes,
  authPublicRoutes,
} from "../../modules/auth/auth.routes";
import {
  businessInternalRoutes,
  businessRoutes,
} from "../../modules/business/business.routes";
import { serviceRoutes } from "../../modules/service/service.routes";
import { employeeRoutes } from "../../modules/employee/employee.routes";
import { customerRoutes } from "../../modules/customer/customer.routes";
import { timeBlockRoutes } from "../../modules/timeblock/timeblock.routes";
import { appointmentRoutes } from "../../modules/appointment/appointment.routes";
import { schedulingRoutes } from "../../modules/scheduling/scheduling.routes";
import {
  agentInternalRoutes,
  agentRoutes,
} from "../../modules/agent/agent.routes";
import { healthRoutes } from "../health/health.routes";
import { buildOpenApiDocument } from "./openapi.document";

type RouteLayer = {
  route?: { path: string; methods: Record<string, boolean> };
};

const mounted: { prefix: string; router: Router }[] = [
  { prefix: "", router: healthRoutes },
  { prefix: "/api/auth", router: authPublicRoutes },
  { prefix: "/api/auth", router: authPrivateRoutes },
  { prefix: "/internal", router: businessInternalRoutes },
  { prefix: "/api", router: businessRoutes },
  { prefix: "/api", router: serviceRoutes },
  { prefix: "/api", router: employeeRoutes },
  { prefix: "/api", router: customerRoutes },
  { prefix: "/api", router: timeBlockRoutes },
  { prefix: "/api", router: appointmentRoutes },
  { prefix: "/api", router: schedulingRoutes },
  { prefix: "/internal", router: agentInternalRoutes },
  { prefix: "/agent", router: agentRoutes },
];

function toOpenApiPath(path: string): string {
  return path.replace(/:(\w+)/g, "{$1}");
}

function registeredOperations(): string[] {
  const operations: string[] = [];

  for (const { prefix, router } of mounted) {
    const layers = (router as unknown as { stack: RouteLayer[] }).stack;

    for (const { route } of layers) {
      if (!route) {
        continue;
      }

      for (const [method, enabled] of Object.entries(route.methods)) {
        if (enabled) {
          operations.push(
            `${method.toUpperCase()} ${prefix}${toOpenApiPath(route.path)}`,
          );
        }
      }
    }
  }

  return operations.sort();
}

function documentedOperations(): string[] {
  const { paths } = buildOpenApiDocument();
  const operations: string[] = [];

  for (const [path, item] of Object.entries(paths)) {
    for (const method of Object.keys(item)) {
      operations.push(`${method.toUpperCase()} ${path}`);
    }
  }

  return operations.sort();
}

function scriptSrcOf(response: { headers: Record<string, string> }): string {
  const csp = response.headers["content-security-policy"] ?? "";

  return (
    csp
      .split(";")
      .find((directive) => directive.trim().startsWith("script-src ")) ?? ""
  );
}

describe("documento OpenAPI", () => {
  it("documenta todas as rotas registradas", () => {
    const documented = new Set(documentedOperations());
    const faltando = registeredOperations().filter(
      (operation) => !documented.has(operation),
    );

    expect(faltando).toEqual([]);
  });

  it("não documenta rota que não existe", () => {
    const registered = new Set(registeredOperations());
    const sobrando = documentedOperations().filter(
      (operation) => !registered.has(operation),
    );

    expect(sobrando).toEqual([]);
  });

  it("não expõe credenciais da Meta em nenhuma resposta", () => {
    const { components } = buildOpenApiDocument();
    const serialized = JSON.stringify(components.schemas);

    expect(serialized).not.toContain("metaAccessToken");
    expect(serialized).not.toContain("metaAppSecret");
  });

  it("serve a spec sem exigir autenticação", async () => {
    const response = await request(app).get("/docs/openapi.json");

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe("3.0.3");
    expect(Object.keys(response.body.paths).length).toBeGreaterThan(0);
  });

  it("serve a interface sem exigir autenticação", async () => {
    const response = await request(app).get("/docs/");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });

  it("relaxa o CSP apenas na interface, não no resto da API", async () => {
    const docs = await request(app).get("/docs/");
    const health = await request(app).get("/health");

    expect(scriptSrcOf(docs)).toContain("'unsafe-inline'");
    expect(scriptSrcOf(health)).not.toContain("'unsafe-inline'");
  });

  it("mantém o limit de disponibilidade com default 3", () => {
    const { paths } = buildOpenApiDocument();
    const parameters = paths["/api/availability"].get.parameters as {
      name: string;
      schema: { default?: number };
    }[];

    const limit = parameters.find((parameter) => parameter.name === "limit");

    expect(limit?.schema.default).toBe(3);
  });
});
