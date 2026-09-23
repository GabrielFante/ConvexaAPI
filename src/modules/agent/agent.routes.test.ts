import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  business: { resolveByMetaPhoneNumberId: vi.fn() },
  customer: { resolve: vi.fn() },
  service: { list: vi.fn() },
  employee: { list: vi.fn() },
  engine: {
    getAvailability: vi.fn(),
    listAppointments: vi.fn(),
    getAppointment: vi.fn(),
    createAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
  },
}));

vi.mock("../business/business.service", () => ({
  businessService: mocks.business,
}));
vi.mock("../customer/customer.service", () => ({
  customerService: mocks.customer,
}));
vi.mock("../service/service.service", () => ({
  serviceService: mocks.service,
}));
vi.mock("../employee/employee.service", () => ({
  employeeService: mocks.employee,
}));
vi.mock("../scheduling/scheduling.engine", () => ({
  schedulingEngine: mocks.engine,
}));

import { app } from "../../app";
import { env } from "../../shared/env";
import { AppError } from "../../shared/errors/AppError";
import { getBusinessId } from "../../shared/tenant/tenant-context";
import { bearer, TENANT_A } from "../../test/http";

const CUSTOMER = "cccccccc-1111-4111-8111-111111111111";
const OTHER_CUSTOMER = "cccccccc-9999-4999-8999-999999999999";
const SERVICE = "55555555-1111-4111-8111-111111111111";
const EMPLOYEE = "66666666-1111-4111-8111-111111111111";
const APPOINTMENT = "dddddddd-1111-4111-8111-111111111111";

const tenant = {
  businessId: TENANT_A,
  name: "Barbearia do tenant A",
  timezone: "America/Sao_Paulo",
  aiSystemPrompt: "Voce e a atendente da barbearia",
};

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT,
    customerId: CUSTOMER,
    employeeId: EMPLOYEE,
    serviceId: SERVICE,
    startAt: new Date("2026-09-23T17:30:00.000Z"),
    endAt: new Date("2026-09-23T18:00:00.000Z"),
    status: "SCHEDULED",
    priceCents: 5000,
    durationMinutes: 30,
    notes: null,
    createdAt: new Date("2026-09-22T12:00:00.000Z"),
    updatedAt: new Date("2026-09-22T12:00:00.000Z"),
    customer: { id: CUSTOMER, name: "João", phone: "+5511999999999" },
    employee: { id: EMPLOYEE, name: "Carlos" },
    service: { id: SERVICE, name: "Corte", durationMinutes: 30 },
    ...overrides,
  };
}

let tenantSeenByResolve: string | undefined;

async function openSession() {
  const response = await request(app)
    .post("/internal/agent-sessions")
    .set("x-internal-key", env.INTERNAL_API_KEY)
    .send({ phoneNumberId: "111111111", phone: "11 99999-9999", name: "João" });

  return response;
}

async function agentAuth() {
  const { body } = await openSession();
  return `Bearer ${body.token as string}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  tenantSeenByResolve = undefined;

  mocks.business.resolveByMetaPhoneNumberId.mockResolvedValue(tenant);
  mocks.customer.resolve.mockImplementation(
    (input: { phone: string; name?: string }) => {
      tenantSeenByResolve = getBusinessId();
      return Promise.resolve({
        id: CUSTOMER,
        name: input.name ?? "",
        phone: input.phone,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    },
  );
  mocks.service.list.mockResolvedValue({
    data: [
      {
        id: SERVICE,
        name: "Corte",
        durationMinutes: 30,
        priceCents: 5000,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    meta: { page: 1, perPage: 100, total: 1, totalPages: 1 },
  });
  mocks.employee.list.mockResolvedValue({
    data: [{ id: EMPLOYEE, name: "Carlos", active: true }],
    meta: { page: 1, perPage: 100, total: 1, totalPages: 1 },
  });
});

describe("POST /internal/agent-sessions", () => {
  it("exige a chave interna", async () => {
    const response = await request(app)
      .post("/internal/agent-sessions")
      .send({ phoneNumberId: "111111111", phone: "11999999999" });

    expect(response.status).toBe(401);
    expect(mocks.business.resolveByMetaPhoneNumberId).not.toHaveBeenCalled();
  });

  it("resolve o tenant pelo número da Meta e o cliente dentro dele", async () => {
    const response = await openSession();

    expect(response.status).toBe(201);
    expect(mocks.business.resolveByMetaPhoneNumberId).toHaveBeenCalledWith(
      "111111111",
    );
    expect(mocks.customer.resolve).toHaveBeenCalledWith({
      phone: "+5511999999999",
      name: "João",
    });
    expect(tenantSeenByResolve).toBe(TENANT_A);
    expect(response.body).toMatchObject({
      tokenType: "Bearer",
      expiresIn: 300,
      business: {
        id: TENANT_A,
        name: tenant.name,
        timezone: tenant.timezone,
        aiSystemPrompt: tenant.aiSystemPrompt,
      },
      customer: { id: CUSTOMER, name: "João", phone: "+5511999999999" },
    });
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.now).toEqual({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      weekday: expect.any(String),
      time: expect.stringMatching(/^\d{2}:\d{2}$/),
    });
  });

  it("devolve 404 quando o número não é de nenhuma empresa", async () => {
    mocks.business.resolveByMetaPhoneNumberId.mockRejectedValue(
      new AppError("Número não cadastrado em nenhuma empresa", 404),
    );

    const response = await openSession();

    expect(response.status).toBe(404);
    expect(mocks.customer.resolve).not.toHaveBeenCalled();
  });

  it("recusa telefone inválido", async () => {
    const response = await request(app)
      .post("/internal/agent-sessions")
      .set("x-internal-key", env.INTERNAL_API_KEY)
      .send({ phoneNumberId: "111111111", phone: "123" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("autenticação em /agent", () => {
  it("recusa requisição sem token", async () => {
    const response = await request(app).get("/agent/services");

    expect(response.status).toBe(401);
  });

  it("recusa o token do painel", async () => {
    const response = await request(app)
      .get("/agent/services")
      .set("authorization", bearer());

    expect(response.status).toBe(401);
    expect(mocks.service.list).not.toHaveBeenCalled();
  });

  it("o token do agente não abre as rotas do painel", async () => {
    const response = await request(app)
      .get("/api/customers")
      .set("authorization", await agentAuth());

    expect(response.status).toBe(401);
  });

  it("a chave interna sozinha não abre as tools", async () => {
    const response = await request(app)
      .get("/agent/services")
      .set("x-internal-key", env.INTERNAL_API_KEY);

    expect(response.status).toBe(401);
  });
});

describe("tools do agente", () => {
  it("lista os serviços sem campos internos", async () => {
    const response = await request(app)
      .get("/agent/services")
      .set("authorization", await agentAuth());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: SERVICE, name: "Corte", durationMinutes: 30, priceCents: 5000 },
    ]);
  });

  it("consulta horários com limit 3 por padrão e hora no fuso da empresa", async () => {
    mocks.engine.getAvailability.mockResolvedValue({
      date: "2026-09-23",
      serviceId: SERVICE,
      durationMinutes: 30,
      totalSlots: 12,
      slots: [
        {
          employeeId: EMPLOYEE,
          startAt: new Date("2026-09-23T13:00:00.000Z"),
          endAt: new Date("2026-09-23T13:30:00.000Z"),
        },
      ],
    });

    const response = await request(app)
      .get(`/agent/availability?serviceId=${SERVICE}&date=2026-09-23`)
      .set("authorization", await agentAuth());

    expect(response.status).toBe(200);
    expect(mocks.engine.getAvailability).toHaveBeenCalledWith({
      serviceId: SERVICE,
      date: "2026-09-23",
      limit: 3,
    });
    expect(response.body).toEqual({
      date: "2026-09-23",
      weekday: "quarta-feira",
      serviceId: SERVICE,
      durationMinutes: 30,
      totalSlots: 12,
      slots: [
        {
          employeeId: EMPLOYEE,
          employeeName: "Carlos",
          startAt: "2026-09-23T13:00:00.000Z",
          endAt: "2026-09-23T13:30:00.000Z",
          time: "10:00",
        },
      ],
    });
  });

  it("recusa limit acima de 10", async () => {
    const response = await request(app)
      .get(`/agent/availability?serviceId=${SERVICE}&date=2026-09-23&limit=11`)
      .set("authorization", await agentAuth());

    expect(response.status).toBe(400);
    expect(mocks.engine.getAvailability).not.toHaveBeenCalled();
  });

  it("agenda para o cliente do token, ignorando customerId no corpo", async () => {
    mocks.engine.createAppointment.mockResolvedValue(appointment());

    const response = await request(app)
      .post("/agent/appointments")
      .set("authorization", await agentAuth())
      .send({
        serviceId: SERVICE,
        employeeId: EMPLOYEE,
        startAt: "2026-09-23T17:30:00.000Z",
        customerId: OTHER_CUSTOMER,
      });

    expect(response.status).toBe(201);
    expect(mocks.engine.createAppointment).toHaveBeenCalledWith({
      serviceId: SERVICE,
      employeeId: EMPLOYEE,
      startAt: new Date("2026-09-23T17:30:00.000Z"),
      customerId: CUSTOMER,
    });
    expect(response.body).toEqual({
      id: APPOINTMENT,
      status: "SCHEDULED",
      startAt: "2026-09-23T17:30:00.000Z",
      endAt: "2026-09-23T18:00:00.000Z",
      date: "2026-09-23",
      weekday: "quarta-feira",
      time: "14:30",
      priceCents: 5000,
      durationMinutes: 30,
      service: { id: SERVICE, name: "Corte" },
      employee: { id: EMPLOYEE, name: "Carlos" },
    });
  });

  it("propaga o conflito do engine com code", async () => {
    mocks.engine.createAppointment.mockRejectedValue(
      new AppError("Horário indisponível", 409, "APPOINTMENT_CONFLICT"),
    );

    const response = await request(app)
      .post("/agent/appointments")
      .set("authorization", await agentAuth())
      .send({
        serviceId: SERVICE,
        employeeId: EMPLOYEE,
        startAt: "2026-09-23T17:30:00.000Z",
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("APPOINTMENT_CONFLICT");
  });

  it("lista só os agendamentos ativos do cliente do token", async () => {
    mocks.engine.listAppointments.mockResolvedValue([
      appointment(),
      appointment({
        id: "dddddddd-2222-4222-8222-222222222222",
        status: "CANCELLED",
      }),
      appointment({
        id: "dddddddd-3333-4333-8333-333333333333",
        status: "CONFIRMED",
      }),
    ]);

    const response = await request(app)
      .get("/agent/appointments")
      .set("authorization", await agentAuth());

    expect(response.status).toBe(200);
    expect(mocks.engine.listAppointments).toHaveBeenCalledWith({
      customerId: CUSTOMER,
      from: expect.any(Date),
    });
    expect(
      response.body.map((item: { status: string }) => item.status),
    ).toEqual(["SCHEDULED", "CONFIRMED"]);
    expect(JSON.stringify(response.body)).not.toContain("+5511999999999");
  });

  it("cancela o próprio agendamento", async () => {
    mocks.engine.getAppointment.mockResolvedValue(appointment());
    mocks.engine.cancelAppointment.mockResolvedValue(
      appointment({ status: "CANCELLED" }),
    );

    const response = await request(app)
      .post(`/agent/appointments/${APPOINTMENT}/cancel`)
      .set("authorization", await agentAuth());

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("CANCELLED");
    expect(mocks.engine.cancelAppointment).toHaveBeenCalledWith(APPOINTMENT);
  });

  it("não cancela agendamento de outro cliente do mesmo tenant", async () => {
    mocks.engine.getAppointment.mockResolvedValue(
      appointment({ customerId: OTHER_CUSTOMER }),
    );

    const response = await request(app)
      .post(`/agent/appointments/${APPOINTMENT}/cancel`)
      .set("authorization", await agentAuth());

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("APPOINTMENT_NOT_FOUND");
    expect(mocks.engine.cancelAppointment).not.toHaveBeenCalled();
  });
});
