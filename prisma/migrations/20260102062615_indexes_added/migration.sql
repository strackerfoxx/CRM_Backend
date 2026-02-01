-- CreateIndex
CREATE INDEX "Appointment_businessId_date_status_idx" ON "public"."Appointment"("businessId", "date", "status");

-- CreateIndex
CREATE INDEX "AppointmentService_appointmentId_idx" ON "public"."AppointmentService"("appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentService_userId_idx" ON "public"."AppointmentService"("userId");

-- CreateIndex
CREATE INDEX "Service_businessId_idx" ON "public"."Service"("businessId");
