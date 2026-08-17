import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "../../shared/errors/AppError";
import { schedulingEngine } from "../scheduling/scheduling.engine";
import { appointmentService } from "./appointment.service";

vi.mock("../scheduling/scheduling.engine", () => ({
  schedulingEngine: { createAppointment: vi.fn() },
}));

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
