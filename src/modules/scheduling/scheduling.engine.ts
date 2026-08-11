import { AppError } from "../../shared/errors/AppError";
import {
  formatCalendarDay,
  getCalendarDay,
  parseCalendarDay,
  type CalendarDay,
} from "../../shared/utils/timezone";
import { customerService } from "../customer/customer.service";
import { employeeService } from "../employee/employee.service";
import { serviceService } from "../service/service.service";
import { checkSlot, computeAvailability } from "./availability";
import { schedulingRepository } from "./scheduling.repository";
import type {
  AvailabilitySlot,
  EmployeeSchedule,
  ScheduleConfig,
  ScheduleContext,
  SlotViolation,
} from "./scheduling.types";

const MINUTE_MS = 60_000;

const violationErrors: Record<
  SlotViolation,
  { message: string; status: number }
> = {
  PAST: {
    message: "Não é possível agendar em um horário que já passou",
    status: 400,
  },
  CLOSED_DAY: {
    message: "A empresa não atende nesta data",
    status: 409,
  },
  BUSINESS_VACATION: {
    message: "A empresa está em férias nesta data",
    status: 409,
  },
  EMPLOYEE_VACATION: {
    message: "O funcionário está em férias nesta data",
    status: 409,
  },
  OUTSIDE_BUSINESS_HOURS: {
    message: "Horário fora do funcionamento da empresa",
    status: 409,
  },
  OUTSIDE_EMPLOYEE_HOURS: {
    message: "Horário fora da jornada do funcionário",
    status: 409,
  },
  TIME_BLOCK: {
    message: "Horário indisponível: existe um bloqueio na agenda",
    status: 409,
  },
  APPOINTMENT_CONFLICT: {
    message: "Horário indisponível: conflito com outro agendamento",
    status: 409,
  },
};

export type AvailabilityQuery = {
  serviceId: string;
  date: string;
  employeeId?: string;
  slotIntervalMinutes?: number;
};

export type AvailabilityResult = {
  date: string;
  serviceId: string;
  durationMinutes: number;
  slots: AvailabilitySlot[];
};

export type CreateAppointmentInput = {
  customerId: string;
  serviceId: string;
  employeeId: string;
  startAt: Date;
  notes?: string;
};

export type RescheduleAppointmentInput = {
  startAt: Date;
  employeeId?: string;
};

type EligibleEmployee = {
  id: string;
  hours: { dayOfWeek: number; startsAt: number; endsAt: number }[];
};

async function loadConfig(): Promise<ScheduleConfig> {
  const config = await schedulingRepository.getConfig();

  if (!config) {
    throw new AppError("Empresa (tenant) não encontrada", 404);
  }

  return config;
}

async function loadActiveService(serviceId: string) {
  const service = await serviceService.get(serviceId);

  if (!service.active) {
    throw new AppError("Serviço inativo", 400);
  }

  return service;
}

async function loadEligibleEmployees(
  serviceId: string,
  employeeId?: string,
): Promise<EligibleEmployee[]> {
  if (employeeId) {
    const employee = await employeeService.get(employeeId);

    if (!employee.active) {
      throw new AppError("Funcionário inativo", 400);
    }
  }

  const employees = await schedulingRepository.listEligibleEmployees(
    serviceId,
    employeeId,
  );

  if (employeeId && !employees.length) {
    throw new AppError("Funcionário não realiza este serviço", 400);
  }

  return employees;
}

function toSchedules(employees: EligibleEmployee[]): EmployeeSchedule[] {
  return employees.map((employee) => ({
    employeeId: employee.id,
    hours: employee.hours,
  }));
}

async function buildContext(params: {
  config: ScheduleConfig;
  day: CalendarDay;
  durationMinutes: number;
  employees: EligibleEmployee[];
  slotIntervalMinutes?: number;
}): Promise<ScheduleContext> {
  const { config, day, durationMinutes, employees } = params;

  const data = await schedulingRepository.loadScheduleData({
    day,
    timezone: config.timezone,
    employeeIds: employees.map((employee) => employee.id),
    paddingMinutes: config.bufferMinutes + durationMinutes,
  });

  return {
    ...config,
    ...data,
    slotIntervalMinutes:
      params.slotIntervalMinutes ?? config.slotIntervalMinutes,
    employees: toSchedules(employees),
    day,
    durationMinutes,
    now: new Date(),
  };
}

function assertBookable(
  context: ScheduleContext,
  request: {
    employeeId: string;
    startAt: Date;
    endAt: Date;
    ignoreAppointmentId?: string;
  },
) {
  const violation = checkSlot(context, request);

  if (violation) {
    const error = violationErrors[violation];
    throw new AppError(error.message, error.status);
  }
}

export const schedulingEngine = {
  async getAvailability(query: AvailabilityQuery): Promise<AvailabilityResult> {
    const service = await loadActiveService(query.serviceId);
    const employees = await loadEligibleEmployees(
      query.serviceId,
      query.employeeId,
    );
    const day = parseCalendarDay(query.date);

    const result: AvailabilityResult = {
      date: formatCalendarDay(day),
      serviceId: service.id,
      durationMinutes: service.durationMinutes,
      slots: [],
    };

    if (!employees.length) {
      return result;
    }

    const config = await loadConfig();
    const context = await buildContext({
      config,
      day,
      durationMinutes: service.durationMinutes,
      employees,
      slotIntervalMinutes: query.slotIntervalMinutes,
    });

    result.slots = computeAvailability(context);

    return result;
  },

  async createAppointment(input: CreateAppointmentInput) {
    await customerService.get(input.customerId);

    const service = await loadActiveService(input.serviceId);
    const employees = await loadEligibleEmployees(
      input.serviceId,
      input.employeeId,
    );

    const config = await loadConfig();
    const startAt = input.startAt;
    const endAt = new Date(
      startAt.getTime() + service.durationMinutes * MINUTE_MS,
    );

    const context = await buildContext({
      config,
      day: getCalendarDay(startAt, config.timezone),
      durationMinutes: service.durationMinutes,
      employees,
    });

    assertBookable(context, { employeeId: input.employeeId, startAt, endAt });

    const appointment = await schedulingRepository.create({
      customerId: input.customerId,
      employeeId: input.employeeId,
      serviceId: input.serviceId,
      startAt,
      endAt,
      priceCents: service.priceCents,
      durationMinutes: service.durationMinutes,
      notes: input.notes,
    });

    if (!appointment) {
      const conflict = violationErrors.APPOINTMENT_CONFLICT;
      throw new AppError(conflict.message, conflict.status);
    }

    return appointment;
  },

  async cancelAppointment(id: string) {
    const appointment = await schedulingRepository.findById(id);

    if (!appointment) {
      throw new AppError("Agendamento não encontrado", 404);
    }

    if (appointment.status === "CANCELLED") {
      throw new AppError("Agendamento já está cancelado", 409);
    }

    if (appointment.status === "COMPLETED") {
      throw new AppError(
        "Não é possível cancelar um agendamento já concluído",
        409,
      );
    }

    return schedulingRepository.updateStatus(id, "CANCELLED");
  },

  async rescheduleAppointment(id: string, input: RescheduleAppointmentInput) {
    const appointment = await schedulingRepository.findById(id);

    if (!appointment) {
      throw new AppError("Agendamento não encontrado", 404);
    }

    if (
      appointment.status !== "SCHEDULED" &&
      appointment.status !== "CONFIRMED"
    ) {
      throw new AppError("Só é possível reagendar um agendamento ativo", 409);
    }

    const employeeId = input.employeeId ?? appointment.employeeId;
    const employees = await loadEligibleEmployees(
      appointment.serviceId,
      employeeId,
    );

    const config = await loadConfig();
    const startAt = input.startAt;
    const endAt = new Date(
      startAt.getTime() + appointment.durationMinutes * MINUTE_MS,
    );

    const context = await buildContext({
      config,
      day: getCalendarDay(startAt, config.timezone),
      durationMinutes: appointment.durationMinutes,
      employees,
    });

    assertBookable(context, {
      employeeId,
      startAt,
      endAt,
      ignoreAppointmentId: id,
    });

    const rescheduled = await schedulingRepository.reschedule(id, {
      employeeId,
      startAt,
      endAt,
    });

    if (!rescheduled) {
      const conflict = violationErrors.APPOINTMENT_CONFLICT;
      throw new AppError(conflict.message, conflict.status);
    }

    return rescheduled;
  },
};
