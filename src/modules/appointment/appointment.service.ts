import { schedulingEngine } from "../scheduling/scheduling.engine";
import type {
  CreateAppointmentInput,
  RescheduleAppointmentInput,
} from "./appointment.schema";

export const appointmentService = {
  create(data: CreateAppointmentInput) {
    return schedulingEngine.createAppointment(data);
  },

  cancel(id: string) {
    return schedulingEngine.cancelAppointment(id);
  },

  confirm(id: string) {
    return schedulingEngine.confirmAppointment(id);
  },

  complete(id: string) {
    return schedulingEngine.completeAppointment(id);
  },

  reschedule(id: string, data: RescheduleAppointmentInput) {
    return schedulingEngine.rescheduleAppointment(id, data);
  },
};
