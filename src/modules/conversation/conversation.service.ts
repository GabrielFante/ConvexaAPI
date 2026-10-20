import {
  CONVERSATION_TOKEN_TTL_SECONDS,
  signConversationToken,
} from "../../shared/auth/conversation-token";
import { AppError } from "../../shared/errors/AppError";
import {
  getCurrentConversation,
  runWithTenant,
} from "../../shared/tenant/tenant-context";
import {
  dayOfWeekOf,
  formatCalendarDay,
  getZonedParts,
  parseCalendarDay,
} from "../../shared/utils/timezone";
import { MAX_PER_PAGE } from "../../shared/validation/pagination";
import { businessService } from "../business/business.service";
import { customerService } from "../customer/customer.service";
import { employeeService } from "../employee/employee.service";
import { schedulingEngine } from "../scheduling/scheduling.engine";
import { serviceService } from "../service/service.service";
import type {
  ConversationAvailabilityQuery,
  ConversationBookInput,
  ConversationRescheduleInput,
  ConversationSessionInput,
} from "./conversation.schema";

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

const ACTIVE_STATUSES = new Set(["SCHEDULED", "CONFIRMED"]);

const ALL_ACTIVE = { page: 1, perPage: MAX_PER_PAGE, includeInactive: false };

type EngineAppointment = Awaited<
  ReturnType<typeof schedulingEngine.getAppointment>
>;

function weekdayOf(dayOfWeek: number): string {
  return WEEKDAYS[dayOfWeek] ?? "";
}

function wallClock(instant: Date, timezone: string) {
  const parts = getZonedParts(instant, timezone);
  const hours = String(Math.floor(parts.minuteOfDay / 60)).padStart(2, "0");
  const minutes = String(parts.minuteOfDay % 60).padStart(2, "0");

  return {
    date: formatCalendarDay(parts),
    weekday: weekdayOf(parts.dayOfWeek),
    time: `${hours}:${minutes}`,
  };
}

function toConversationAppointment(
  appointment: EngineAppointment,
  timezone: string,
) {
  return {
    id: appointment.id,
    status: appointment.status,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    ...wallClock(appointment.startAt, timezone),
    priceCents: appointment.priceCents,
    durationMinutes: appointment.durationMinutes,
    service: { id: appointment.service.id, name: appointment.service.name },
    employee: { id: appointment.employee.id, name: appointment.employee.name },
  };
}

async function loadOwnAppointment(id: string) {
  const { customerId } = getCurrentConversation();
  const appointment = await schedulingEngine.getAppointment(id);

  if (appointment.customerId !== customerId) {
    throw new AppError(
      "Agendamento não encontrado",
      404,
      "APPOINTMENT_NOT_FOUND",
    );
  }

  return appointment;
}

export const conversationService = {
  async createSession({
    phoneNumberId,
    phone,
    name,
  }: ConversationSessionInput) {
    const tenant =
      await businessService.resolveByMetaPhoneNumberId(phoneNumberId);
    const customer = await runWithTenant(tenant.businessId, () =>
      customerService.resolve({ phone, name }),
    );

    return {
      token: signConversationToken({
        customerId: customer.id,
        businessId: tenant.businessId,
        timezone: tenant.timezone,
      }),
      tokenType: "Bearer",
      expiresIn: CONVERSATION_TOKEN_TTL_SECONDS,
      business: {
        id: tenant.businessId,
        name: tenant.name,
        timezone: tenant.timezone,
      },
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      now: wallClock(new Date(), tenant.timezone),
    };
  },

  async listServices() {
    const { data } = await serviceService.list(ALL_ACTIVE);

    return data.map(({ id, name, durationMinutes, priceCents }) => ({
      id,
      name,
      durationMinutes,
      priceCents,
    }));
  },

  async availability(query: ConversationAvailabilityQuery) {
    const { timezone } = getCurrentConversation();
    const [result, employees] = await Promise.all([
      schedulingEngine.getAvailability(query),
      employeeService.list(ALL_ACTIVE),
    ]);
    const names = new Map(employees.data.map(({ id, name }) => [id, name]));

    return {
      date: result.date,
      weekday: weekdayOf(dayOfWeekOf(parseCalendarDay(result.date))),
      serviceId: result.serviceId,
      durationMinutes: result.durationMinutes,
      totalSlots: result.totalSlots,
      slots: result.slots.map((slot) => ({
        employeeId: slot.employeeId,
        employeeName: names.get(slot.employeeId) ?? null,
        startAt: slot.startAt,
        endAt: slot.endAt,
        time: wallClock(slot.startAt, timezone).time,
      })),
    };
  },

  async listAppointments() {
    const { customerId, timezone } = getCurrentConversation();
    const appointments = await schedulingEngine.listAppointments({
      customerId,
      from: new Date(),
    });

    return appointments
      .filter(({ status }) => ACTIVE_STATUSES.has(status))
      .map((appointment) => toConversationAppointment(appointment, timezone));
  },

  async book(input: ConversationBookInput) {
    const { customerId, timezone } = getCurrentConversation();
    const appointment = await schedulingEngine.createAppointment({
      ...input,
      customerId,
    });

    return toConversationAppointment(appointment, timezone);
  },

  async cancel(id: string) {
    const { timezone } = getCurrentConversation();

    await loadOwnAppointment(id);

    const cancelled = await schedulingEngine.cancelAppointment(id);

    return toConversationAppointment(cancelled, timezone);
  },

  async reschedule(id: string, input: ConversationRescheduleInput) {
    const { timezone } = getCurrentConversation();

    await loadOwnAppointment(id);

    const rescheduled = await schedulingEngine.rescheduleAppointment(id, input);

    return toConversationAppointment(rescheduled, timezone);
  },
};
