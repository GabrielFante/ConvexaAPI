import { describe, it, expect, beforeEach, vi } from "vitest";
import { businessRepository } from "./business.repository";
import { businessService } from "./business.service";

vi.mock("./business.repository", () => ({
  businessRepository: {
    addClosedDay: vi.fn(),
    addVacation: vi.fn(),
    findByMetaPhoneNumberId: vi.fn(),
  },
}));

vi.mock("../employee/employee.service", () => ({
  employeeService: { get: vi.fn() },
}));

const repository = vi.mocked(businessRepository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("businessService — conversão das datas de calendário", () => {
  it("grava o dia fechado em UTC meia-noite", async () => {
    await businessService.addClosedDay({ date: "2026-12-25" });

    expect(repository.addClosedDay).toHaveBeenCalledWith({
      date: new Date("2026-12-25T00:00:00.000Z"),
    });
  });

  it("grava as férias em UTC meia-noite nos dois extremos", async () => {
    await businessService.addVacation({
      startDate: "2026-12-24",
      endDate: "2026-12-26",
      reason: "Recesso",
    });

    expect(repository.addVacation).toHaveBeenCalledWith({
      startDate: new Date("2026-12-24T00:00:00.000Z"),
      endDate: new Date("2026-12-26T00:00:00.000Z"),
      reason: "Recesso",
    });
  });
});

describe("businessService — resolução pelo número da Meta", () => {
  it("devolve só os campos que o n8n precisa", async () => {
    repository.findByMetaPhoneNumberId.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Barbearia do Gabriel",
      timezone: "America/Sao_Paulo",
      aiSystemPrompt: "Você é a atendente da barbearia",
    });

    const tenant =
      await businessService.resolveByMetaPhoneNumberId("1234567890");

    expect(tenant).toEqual({
      businessId: "11111111-1111-4111-8111-111111111111",
      name: "Barbearia do Gabriel",
      timezone: "America/Sao_Paulo",
      aiSystemPrompt: "Você é a atendente da barbearia",
    });
    expect(Object.keys(tenant)).toEqual([
      "businessId",
      "name",
      "timezone",
      "aiSystemPrompt",
    ]);
  });

  it("consulta o repositório pelo número informado", async () => {
    repository.findByMetaPhoneNumberId.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Barbearia do Gabriel",
      timezone: "America/Sao_Paulo",
      aiSystemPrompt: null,
    });

    await businessService.resolveByMetaPhoneNumberId("1234567890");

    expect(repository.findByMetaPhoneNumberId).toHaveBeenCalledWith(
      "1234567890",
    );
  });

  it("responde 404 quando o número não está cadastrado", async () => {
    repository.findByMetaPhoneNumberId.mockResolvedValue(null);

    await expect(
      businessService.resolveByMetaPhoneNumberId("0000000000"),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Número não cadastrado em nenhuma empresa",
    });
  });
});
