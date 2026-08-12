import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "../../shared/errors/AppError";
import { employeeService } from "../employee/employee.service";
import { timeBlockRepository } from "./timeblock.repository";
import { timeBlockService } from "./timeblock.service";

vi.mock("../employee/employee.service", () => ({
  employeeService: { get: vi.fn() },
}));

vi.mock("./timeblock.repository", () => ({
  timeBlockRepository: {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

const EMPLOYEE = "88888888-8888-4888-8888-888888888888";

const input = {
  startAt: new Date("2026-12-25T13:00:00.000Z"),
  endAt: new Date("2026-12-25T15:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("timeBlockService", () => {
  it("cria bloqueio da empresa sem consultar funcionário", async () => {
    await timeBlockService.create(input);

    expect(employeeService.get).not.toHaveBeenCalled();
    expect(timeBlockRepository.create).toHaveBeenCalledWith(input);
  });

  it("valida o funcionário pelo service do módulo employee", async () => {
    await timeBlockService.create({ ...input, employeeId: EMPLOYEE });

    expect(employeeService.get).toHaveBeenCalledWith(EMPLOYEE);
  });

  it("recusa funcionário de outro tenant sem gravar nada", async () => {
    vi.mocked(employeeService.get).mockRejectedValue(
      new AppError("Funcionário não encontrado", 404),
    );

    await expect(
      timeBlockService.create({ ...input, employeeId: EMPLOYEE }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Funcionário não encontrado",
    });
    expect(timeBlockRepository.create).not.toHaveBeenCalled();
  });

  it("repassa o filtro de listagem ao repository", async () => {
    await timeBlockService.list({ employeeId: EMPLOYEE });

    expect(timeBlockRepository.list).toHaveBeenCalledWith({
      employeeId: EMPLOYEE,
    });
  });
});
