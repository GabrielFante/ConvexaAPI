import { describe, it, expect, beforeEach, vi } from "vitest";
import { businessRepository } from "./business.repository";
import { businessService } from "./business.service";

vi.mock("./business.repository", () => ({
  businessRepository: {
    addClosedDay: vi.fn(),
    addVacation: vi.fn(),
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
