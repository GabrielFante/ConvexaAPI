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
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const EMPLOYEE = "88888888-8888-4888-8888-888888888888";
const BLOCK = "77777777-7777-4777-8777-777777777777";

const input = {
  startAt: new Date("2026-12-25T13:00:00.000Z"),
  endAt: new Date("2026-12-25T15:00:00.000Z"),
};

const stored = {
  id: BLOCK,
  employeeId: null,
  reason: null,
  ...input,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(timeBlockRepository.findById).mockResolvedValue(stored);
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

  it("busca o bloqueio pelo id", async () => {
    await expect(timeBlockService.get(BLOCK)).resolves.toEqual(stored);
  });

  it("responde 404 quando o bloqueio não é do tenant", async () => {
    vi.mocked(timeBlockRepository.findById).mockResolvedValue(null);

    await expect(timeBlockService.get(BLOCK)).rejects.toMatchObject({
      statusCode: 404,
      message: "Bloqueio não encontrado",
    });
  });

  it("não atualiza bloqueio inexistente no tenant", async () => {
    vi.mocked(timeBlockRepository.findById).mockResolvedValue(null);

    await expect(
      timeBlockService.update(BLOCK, { reason: "Dentista" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(timeBlockRepository.update).not.toHaveBeenCalled();
  });

  it("valida o novo funcionário antes de atualizar", async () => {
    vi.mocked(employeeService.get).mockRejectedValue(
      new AppError("Funcionário não encontrado", 404),
    );

    await expect(
      timeBlockService.update(BLOCK, { employeeId: EMPLOYEE }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(timeBlockRepository.update).not.toHaveBeenCalled();
  });

  it("recusa update parcial que inverte o intervalo guardado", async () => {
    await expect(
      timeBlockService.update(BLOCK, {
        startAt: new Date("2026-12-25T16:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "endAt deve ser maior que startAt",
    });
    expect(timeBlockRepository.update).not.toHaveBeenCalled();
  });

  it("aceita update parcial que mantém o intervalo válido", async () => {
    const data = { startAt: new Date("2026-12-25T14:00:00.000Z") };

    await timeBlockService.update(BLOCK, data);

    expect(timeBlockRepository.update).toHaveBeenCalledWith(BLOCK, data);
  });
});
