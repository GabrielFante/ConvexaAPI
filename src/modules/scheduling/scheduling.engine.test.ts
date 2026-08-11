import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AppError } from "../../shared/errors/AppError";
import { parseCalendarDay, zonedDayToUtc } from "../../shared/utils/timezone";
import { customerService } from "../customer/customer.service";
import { employeeService } from "../employee/employee.service";
import { serviceService } from "../service/service.service";
import { schedulingEngine } from "./scheduling.engine";
import { schedulingRepository } from "./scheduling.repository";
import type { ScheduleData } from "./scheduling.types";

vi.mock("./scheduling.repository", () => ({
  schedulingRepository: {
    getConfig: vi.fn(),
    listEligibleEmployees: vi.fn(),
    loadScheduleData: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    reschedule: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

vi.mock("../customer/customer.service", () => ({
  customerService: { get: vi.fn() },
}));

vi.mock("../employee/employee.service", () => ({
  employeeService: { get: vi.fn() },
}));

vi.mock("../service/service.service", () => ({
  serviceService: { get: vi.fn() },
}));

const TIMEZONE = "America/Sao_Paulo";
const DAY = parseCalendarDay("2026-08-11");
const BUSINESS_ID = "biz-1";

function at(hour: number, minute = 0): Date {
  return zonedDayToUtc(DAY, hour * 60 + minute, TIMEZONE);
}

type FoundAppointment = NonNullable<
  Awaited<ReturnType<typeof schedulingRepository.findById>>
>;

const service = {
  id: "svc-1",
  businessId: BUSINESS_ID,
  name: "Corte",
  durationMinutes: 60,
  priceCents: 5000,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const customer = {
  id: "cus-1",
  businessId: BUSINESS_ID,
  name: "Ana",
  phone: "5511999999999",
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const employee = {
  id: "emp-1",
  businessId: BUSINESS_ID,
  name: "João",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  services: [{ serviceId: service.id }],
  hours: [],
};

function appointment(
  overrides: Partial<FoundAppointment> = {},
): FoundAppointment {
  return {
    id: "appt-1",
    businessId: BUSINESS_ID,
    customerId: customer.id,
    employeeId: employee.id,
    serviceId: service.id,
    startAt: at(10),
    endAt: at(11),
    status: "SCHEDULED",
    priceCents: service.priceCents,
    durationMinutes: service.durationMinutes,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    customer: { id: customer.id, name: customer.name, phone: customer.phone },
    employee: { id: employee.id, name: employee.name },
    service: {
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes,
    },
    ...overrides,
  };
}

function scheduleData(overrides: Partial<ScheduleData> = {}): ScheduleData {
  return {
    businessHours: [{ dayOfWeek: 2, opensAt: 9 * 60, closesAt: 18 * 60 }],
    closedDates: [],
    vacations: [],
    timeBlocks: [],
    appointments: [],
    employees: [],
    ...overrides,
  };
}

const repository = vi.mocked(schedulingRepository);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-11T00:00:00.000Z"));

  vi.mocked(serviceService.get).mockResolvedValue(service);
  vi.mocked(customerService.get).mockResolvedValue(customer);
  vi.mocked(employeeService.get).mockResolvedValue(employee);

  repository.getConfig.mockResolvedValue({
    timezone: TIMEZONE,
    slotIntervalMinutes: 30,
    bufferMinutes: 0,
  });
  repository.listEligibleEmployees.mockResolvedValue([
    { id: employee.id, hours: [] },
  ]);
  repository.loadScheduleData.mockResolvedValue(scheduleData());
  repository.create.mockImplementation(async (data) =>
    appointment({ ...data, notes: data.notes ?? null }),
  );
  repository.reschedule.mockImplementation(async (id, data) =>
    appointment({ id, ...data }),
  );
  repository.updateStatus.mockImplementation(async (id, status) =>
    appointment({ id, status }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

function createInput() {
  return {
    customerId: customer.id,
    serviceId: service.id,
    employeeId: employee.id,
    startAt: at(10),
  };
}

describe("schedulingEngine.createAppointment", () => {
  it("recusa agendamento em dia fechado", async () => {
    repository.loadScheduleData.mockResolvedValue(
      scheduleData({ closedDates: [new Date("2026-08-11T00:00:00.000Z")] }),
    );

    await expect(
      schedulingEngine.createAppointment(createInput()),
    ).rejects.toThrow("A empresa não atende nesta data");
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("recusa conflito com agendamento existente", async () => {
    repository.loadScheduleData.mockResolvedValue(
      scheduleData({
        appointments: [
          {
            id: "appt-existente",
            employeeId: employee.id,
            startAt: at(10, 30),
            endAt: at(11, 30),
          },
        ],
      }),
    );

    await expect(
      schedulingEngine.createAppointment(createInput()),
    ).rejects.toMatchObject({
      message: "Horário indisponível: conflito com outro agendamento",
      statusCode: 409,
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("recusa horário fora do funcionamento", async () => {
    await expect(
      schedulingEngine.createAppointment({ ...createInput(), startAt: at(7) }),
    ).rejects.toMatchObject({
      message: "Horário fora do funcionamento da empresa",
      statusCode: 409,
    });
  });

  it("recusa serviço inativo", async () => {
    vi.mocked(serviceService.get).mockResolvedValue({
      ...service,
      active: false,
    });

    await expect(
      schedulingEngine.createAppointment(createInput()),
    ).rejects.toMatchObject({ message: "Serviço inativo", statusCode: 400 });
  });

  it("recusa funcionário que não realiza o serviço", async () => {
    repository.listEligibleEmployees.mockResolvedValue([]);

    await expect(
      schedulingEngine.createAppointment(createInput()),
    ).rejects.toMatchObject({
      message: "Funcionário não realiza este serviço",
      statusCode: 400,
    });
  });

  it("congela duração e preço do serviço no agendamento", async () => {
    await schedulingEngine.createAppointment(createInput());

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: at(10),
        endAt: at(11),
        durationMinutes: 60,
        priceCents: 5000,
      }),
    );
  });

  it("traduz corrida de escrita em conflito", async () => {
    repository.create.mockResolvedValue(null);

    await expect(
      schedulingEngine.createAppointment(createInput()),
    ).rejects.toMatchObject({
      message: "Horário indisponível: conflito com outro agendamento",
      statusCode: 409,
    });
  });
});

describe("schedulingEngine.cancelAppointment", () => {
  it("cancela um agendamento ativo", async () => {
    repository.findById.mockResolvedValue(appointment());

    const cancelled = await schedulingEngine.cancelAppointment("appt-1");

    expect(repository.updateStatus).toHaveBeenCalledWith("appt-1", "CANCELLED");
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("recusa cancelar agendamento concluído", async () => {
    repository.findById.mockResolvedValue(appointment({ status: "COMPLETED" }));

    await expect(
      schedulingEngine.cancelAppointment("appt-1"),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it("recusa cancelar duas vezes", async () => {
    repository.findById.mockResolvedValue(appointment({ status: "CANCELLED" }));

    await expect(schedulingEngine.cancelAppointment("appt-1")).rejects.toThrow(
      "Agendamento já está cancelado",
    );
  });

  it("retorna 404 quando o agendamento não existe no tenant", async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      schedulingEngine.cancelAppointment("appt-1"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("schedulingEngine.rescheduleAppointment", () => {
  it("não conflita com o próprio agendamento ao mudar de horário", async () => {
    repository.findById.mockResolvedValue(appointment());
    repository.loadScheduleData.mockResolvedValue(
      scheduleData({
        appointments: [
          {
            id: "appt-1",
            employeeId: employee.id,
            startAt: at(10),
            endAt: at(11),
          },
        ],
      }),
    );

    await schedulingEngine.rescheduleAppointment("appt-1", {
      startAt: at(10, 30),
    });

    expect(repository.reschedule).toHaveBeenCalledWith("appt-1", {
      employeeId: employee.id,
      startAt: at(10, 30),
      endAt: at(11, 30),
    });
  });

  it("recusa reagendar um agendamento cancelado", async () => {
    repository.findById.mockResolvedValue(appointment({ status: "CANCELLED" }));

    await expect(
      schedulingEngine.rescheduleAppointment("appt-1", { startAt: at(14) }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.reschedule).not.toHaveBeenCalled();
  });
});

describe("schedulingEngine.getAvailability", () => {
  it("retorna vazio quando nenhum funcionário realiza o serviço", async () => {
    repository.listEligibleEmployees.mockResolvedValue([]);

    const result = await schedulingEngine.getAvailability({
      serviceId: service.id,
      date: "2026-08-11",
    });

    expect(result.slots).toEqual([]);
    expect(repository.loadScheduleData).not.toHaveBeenCalled();
  });

  it("carrega a agenda com folga suficiente para o buffer e a duração", async () => {
    repository.getConfig.mockResolvedValue({
      timezone: TIMEZONE,
      slotIntervalMinutes: 60,
      bufferMinutes: 15,
    });

    const result = await schedulingEngine.getAvailability({
      serviceId: service.id,
      date: "2026-08-11",
    });

    expect(repository.loadScheduleData).toHaveBeenCalledWith(
      expect.objectContaining({
        paddingMinutes: 75,
        employeeIds: [employee.id],
      }),
    );
    expect(result.durationMinutes).toBe(60);
    expect(result.slots).toHaveLength(9);
    expect(result.slots[0].startAt).toEqual(at(9));
    expect(result.slots[8].endAt).toEqual(at(18));
  });

  it("propaga o erro de data inválida", async () => {
    await expect(
      schedulingEngine.getAvailability({
        serviceId: service.id,
        date: "11/08/2026",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
