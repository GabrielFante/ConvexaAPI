ALTER TABLE "Business" ADD COLUMN "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Business" ADD COLUMN "bufferMinutes" INTEGER NOT NULL DEFAULT 0;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_employee_no_overlap"
EXCLUDE USING gist (
  "employeeId" WITH =,
  tsrange("startAt", "endAt", '[)') WITH &&
) WHERE ("status" <> 'CANCELLED');
