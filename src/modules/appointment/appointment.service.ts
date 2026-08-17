import { schedulingEngine } from "../scheduling/scheduling.engine";
import type { CreateAppointmentInput } from "./appointment.schema";

export const appointmentService = {
  create(data: CreateAppointmentInput) {
    return schedulingEngine.createAppointment(data);
  },
};
