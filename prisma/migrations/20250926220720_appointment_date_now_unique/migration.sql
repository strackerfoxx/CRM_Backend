/*
  Warnings:

  - A unique constraint covering the columns `[date]` on the table `Appointment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Appointment_date_key" ON "public"."Appointment"("date");
