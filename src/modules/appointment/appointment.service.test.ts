import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "../../shared/errors/AppError";
import { schedulingEngine } from "../scheduling/scheduling.engine";
import { appointmentService } from "./appointment.service";

vi.mock("../scheduling/scheduling.engine", () => ({
  schedulingEngine: {
    createAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
    rescheduleAppointment: vi.fn(),
  },
}));

const APPOINTMENT = "44444444-4444-4444-8444-444444444444";

const input = {
  customerId: "11111111-1111-4111-8111-111111111111",
  serviceId: "22222222-2222-4222-8222-222222222222",
  employeeId: "33333333-3333-4333-8333-333333333333",
  startAt: new Date("2026-12-25T13:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("appointmentService.create", () => {
  it("delega a criação ao scheduling engine", async () => {
    vi.mocked(schedulingEngine.createAppointment).mockResolvedValue({
      id: "appointment-1",
    } as Awaited<ReturnType<typeof schedulingEngine.createAppointment>>);

    const appointment = await appointmentService.create(input);

    expect(schedulingEngine.createAppointment).toHaveBeenCalledWith(input);
    expect(appointment).toEqual({ id: "appointment-1" });
  });

  it("propaga a recusa do engine sem traduzir", async () => {
    vi.mocked(schedulingEngine.createAppointment).mockRejectedValue(
      new AppError("Horário indisponível: conflito com outro agendamento", 409),
    );

    await expect(appointmentService.create(input)).rejects.toMatchObject({
      statusCode: 409,
      message: "Horário indisponível: conflito com outro agendamento",
    });
  });
});

describe("appointmentService.cancel", () => {
  it("delega o cancelamento ao scheduling engine", async () => {
    vi.mocked(schedulingEngine.cancelAppointment).mockResolvedValue({
      id: APPOINTMENT,
      status: "CANCELLED",
    } as Awaited<ReturnType<typeof schedulingEngine.cancelAppointment>>);

    const appointment = await appointmentService.cancel(APPOINTMENT);

    expect(schedulingEngine.cancelAppointment).toHaveBeenCalledWith(
      APPOINTMENT,
    );
    expect(appointment).toMatchObject({ status: "CANCELLED" });
  });

  it("propaga a recusa de cancelar agendamento concluído", async () => {
    vi.mocked(schedulingEngine.cancelAppointment).mockRejectedValue(
      new AppError("Não é possível cancelar um agendamento já concluído", 409),
    );

    await expect(appointmentService.cancel(APPOINTMENT)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe("appointmentService.reschedule", () => {
  const data = { startAt: new Date("2026-12-26T13:00:00.000Z") };

  it("repassa id e dados ao scheduling engine", async () => {
    vi.mocked(schedulingEngine.rescheduleAppointment).mockResolvedValue({
      id: APPOINTMENT,
    } as Awaited<ReturnType<typeof schedulingEngine.rescheduleAppointment>>);

    await appointmentService.reschedule(APPOINTMENT, data);

    expect(schedulingEngine.rescheduleAppointment).toHaveBeenCalledWith(
      APPOINTMENT,
      data,
    );
  });

  it("repassa a troca de funcionário quando ela vem", async () => {
    await appointmentService.reschedule(APPOINTMENT, {
      ...data,
      employeeId: input.employeeId,
    });

    expect(schedulingEngine.rescheduleAppointment).toHaveBeenCalledWith(
      APPOINTMENT,
      { ...data, employeeId: input.employeeId },
    );
  });

  it("propaga o 404 de agendamento inexistente", async () => {
    vi.mocked(schedulingEngine.rescheduleAppointment).mockRejectedValue(
      new AppError("Agendamento não encontrado", 404),
    );

    await expect(
      appointmentService.reschedule(APPOINTMENT, data),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
