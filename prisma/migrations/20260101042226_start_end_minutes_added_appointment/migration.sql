/*
  Warnings:

  - Added the required column `endTimeMinutes` to the `Appointment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startTimeMinutes` to the `Appointment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Appointment" ADD COLUMN     "endTimeMinutes" INTEGER NOT NULL,
ADD COLUMN     "startTimeMinutes" INTEGER NOT NULL;
