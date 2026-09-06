import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { bearer, OWNER_B, STAFF_A, TENANT_A, TENANT_B } from "./test/http";

const CUSTOMER_OF_A = "cccccccc-1111-4111-8111-111111111111";
const CUSTOMER_OF_B = "cccccccc-2222-4222-8222-222222222222";
const APPOINTMENT_OF_A = "dddddddd-1111-4111-8111-111111111111";
const APPOINTMENT_OF_B = "dddddddd-2222-4222-8222-222222222222";
const CANCELLED_OF_A = "dddddddd-3333-4333-8333-333333333333";

const db = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string; businessId: string };

  const initialCustomers: Row[] = [
    {
      id: "cccccccc-1111-4111-8111-111111111111",
      businessId: "11111111-1111-4111-8111-111111111111",
      name: "Cliente do tenant A",
      phone: "5511900000001",
    },
    {
      id: "cccccccc-2222-4222-8222-222222222222",
      businessId: "22222222-2222-4222-8222-222222222222",
      name: "Cliente do tenant B",
      phone: "5511900000002",
    },
  ];

  const initialAppointments: Row[] = [
    {
      id: "dddddddd-1111-4111-8111-111111111111",
      businessId: "11111111-1111-4111-8111-111111111111",
      status: "SCHEDULED",
    },
    {
      id: "dddddddd-2222-4222-8222-222222222222",
      businessId: "22222222-2222-4222-8222-222222222222",
      status: "SCHEDULED",
    },
    {
      id: "dddddddd-3333-4333-8333-333333333333",
      businessId: "11111111-1111-4111-8111-111111111111",
      status: "CANCELLED",
    },
  ];

  const businesses: Row[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      businessId: "11111111-1111-4111-8111-111111111111",
      name: "Barbearia do tenant A",
      slug: "tenant-a",
      timezone: "America/Sao_Paulo",
      phone: "5511900000000",
      metaPhoneNumberId: "111111111",
      metaWabaId: "222222222",
      metaAccessToken: "EAAG-token-super-secreto",
      metaAppSecret: "app-secret-super-secreto",
      aiSystemPrompt: "Voce e a atendente da barbearia",
      slotIntervalMinutes: 15,
      bufferMinutes: 0,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      businessId: "22222222-2222-4222-8222-222222222222",
      name: "Barbearia do tenant B",
      slug: "tenant-b",
      timezone: "America/Sao_Paulo",
      phone: "5511900000009",
      metaPhoneNumberId: "333333333",
      metaWabaId: "444444444",
      metaAccessToken: "EAAG-token-do-tenant-b",
      metaAppSecret: "app-secret-do-tenant-b",
      aiSystemPrompt: null,
      slotIntervalMinutes: 15,
      bufferMinutes: 0,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];

  let customers: Row[] = [];
  let appointments: Row[] = [];

  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([field, value]) => row[field] === value);

  const project = (row: Row, select?: Record<string, unknown>) => {
    if (!select) {
      return { ...row };
    }

    const result: Record<string, unknown> = {};

    for (const [field, selected] of Object.entries(select)) {
      if (!selected) {
        continue;
      }

      result[field] = typeof selected === "object" ? [] : row[field];
    }

    return result;
  };

  const collection = (rows: () => Row[], write: (next: Row[]) => void) => ({
    findMany: vi.fn((args: { where: Record<string, unknown> }) =>
      Promise.resolve(
        rows()
          .filter((row) => matches(row, args.where))
          .map((row) => ({ ...row })),
      ),
    ),
    findFirst: vi.fn(
      (args: {
        where: Record<string, unknown>;
        select?: Record<string, unknown>;
      }) => {
        const found = rows().find((row) => matches(row, args.where));
        return Promise.resolve(found ? project(found, args.select) : null);
      },
    ),
    updateManyAndReturn: vi.fn(
      (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const updated = rows().filter((row) => matches(row, args.where));
        updated.forEach((row) => Object.assign(row, args.data));
        return Promise.resolve(updated.map((row) => ({ ...row })));
      },
    ),
    deleteMany: vi.fn((args: { where: Record<string, unknown> }) => {
      const before = rows().length;
      const kept = rows().filter((row) => !matches(row, args.where));
      write(kept);
      return Promise.resolve({ count: before - kept.length });
    }),
  });

  return {
    reset() {
      customers = initialCustomers.map((row) => ({ ...row }));
      appointments = initialAppointments.map((row) => ({ ...row }));
    },
    customers: () => customers,
    prisma: {
      customer: collection(
        () => customers,
        (next) => {
          customers = next;
        },
      ),
      appointment: collection(
        () => appointments,
        (next) => {
          appointments = next;
        },
      ),
      business: {
        findFirst: vi.fn(
          (args: {
            where: Record<string, unknown>;
            select?: Record<string, unknown>;
          }) => {
            const found = businesses.find((row) => matches(row, args.where));
            return Promise.resolve(found ? project(found, args.select) : null);
          },
        ),
        delete: vi.fn((args: { where: Record<string, unknown> }) =>
          Promise.resolve({ id: args.where["id"] }),
        ),
      },
    },
  };
});

vi.mock("./shared/database/prisma", () => ({ prisma: db.prisma }));

const { app } = await import("./app");

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

describe("autenticacao nas rotas /api", () => {
  it("recusa requisicao sem token", async () => {
    const response = await request(app).get("/api/customers");

    expect(response.status).toBe(401);
    expect(response.body.message).toBeTruthy();
  });

  it("recusa token malformado", async () => {
    const response = await request(app)
      .get("/api/customers")
      .set("authorization", "Bearer nao-e-um-jwt");

    expect(response.status).toBe(401);
  });

  it("exige papel OWNER nas operacoes destrutivas", async () => {
    const response = await request(app)
      .delete("/api/business")
      .set("authorization", bearer({ userId: STAFF_A, role: "STAFF" }));

    expect(response.status).toBe(403);
  });
});

describe("isolamento entre tenants por HTTP", () => {
  it("lista apenas os clientes do proprio tenant", async () => {
    const response = await request(app)
      .get("/api/customers")
      .set("authorization", bearer());

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(CUSTOMER_OF_A);
  });

  it("nao le cliente de outro tenant", async () => {
    const response = await request(app)
      .get(`/api/customers/${CUSTOMER_OF_B}`)
      .set("authorization", bearer());

    expect(response.status).toBe(404);
  });

  it("nao edita cliente de outro tenant", async () => {
    const response = await request(app)
      .patch(`/api/customers/${CUSTOMER_OF_B}`)
      .set("authorization", bearer())
      .send({ name: "Invadido" });

    expect(response.status).toBe(404);

    const untouched = db.customers().find((row) => row.id === CUSTOMER_OF_B);
    expect(untouched?.name).toBe("Cliente do tenant B");
  });

  it("nao apaga cliente de outro tenant", async () => {
    const response = await request(app)
      .delete(`/api/customers/${CUSTOMER_OF_B}`)
      .set("authorization", bearer());

    expect(response.status).toBe(404);
    expect(db.customers()).toHaveLength(2);
  });

  it("nao le agendamento de outro tenant", async () => {
    const response = await request(app)
      .get(`/api/appointments/${APPOINTMENT_OF_B}`)
      .set("authorization", bearer());

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("APPOINTMENT_NOT_FOUND");
  });

  it("ignora o header x-business-id apontando para outro tenant", async () => {
    const response = await request(app)
      .get("/api/customers")
      .set("authorization", bearer())
      .set("x-business-id", TENANT_B);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(CUSTOMER_OF_A);
  });

  it("o token do tenant B enxerga apenas os dados do tenant B", async () => {
    const response = await request(app)
      .get("/api/customers")
      .set("authorization", bearer({ userId: OWNER_B, businessId: TENANT_B }));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(CUSTOMER_OF_B);
  });
});

describe("credenciais nao vazam no HTTP", () => {
  it("GET /api/business nao devolve credenciais da Meta", async () => {
    const response = await request(app)
      .get("/api/business")
      .set("authorization", bearer());

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty("metaAccessToken");
    expect(response.body).not.toHaveProperty("metaAppSecret");
    expect(JSON.stringify(response.body)).not.toContain("super-secreto");
  });

  it("GET /api/business devolve a configuracao da propria empresa", async () => {
    const response = await request(app)
      .get("/api/business")
      .set("authorization", bearer());

    expect(response.body).toMatchObject({
      id: TENANT_A,
      name: "Barbearia do tenant A",
      metaPhoneNumberId: "111111111",
    });
  });
});

describe("codigos de erro legiveis por maquina", () => {
  it("devolve code na transicao de status invalida", async () => {
    const response = await request(app)
      .post(`/api/appointments/${CANCELLED_OF_A}/cancel`)
      .set("authorization", bearer());

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("ALREADY_CANCELLED");
  });

  it("devolve code de validacao quando o corpo e invalido", async () => {
    const response = await request(app)
      .patch(`/api/customers/${CUSTOMER_OF_A}`)
      .set("authorization", bearer())
      .send({ phone: "" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("devolve code em rota inexistente", async () => {
    const response = await request(app)
      .get("/api/nao-existe")
      .set("authorization", bearer());

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("ROUTE_NOT_FOUND");
  });

  it("aceita o cancelamento valido do proprio tenant", async () => {
    const response = await request(app)
      .post(`/api/appointments/${APPOINTMENT_OF_A}/cancel`)
      .set("authorization", bearer());

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("CANCELLED");
  });
});
