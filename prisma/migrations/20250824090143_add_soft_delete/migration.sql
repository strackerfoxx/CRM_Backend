/*
  Warnings:

  - You are about to drop the column `clientId` on the `Note` table. All the data in the column will be lost.
  - Added the required column `businessClientId` to the `Note` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."AppointmentService" DROP CONSTRAINT "AppointmentService_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."BusinessClient" DROP CONSTRAINT "BusinessClient_businessId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Note" DROP CONSTRAINT "Note_clientId_fkey";

-- AlterTable
ALTER TABLE "public"."Appointment" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."Business" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."BusinessClient" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."Note" DROP COLUMN "clientId",
ADD COLUMN     "businessClientId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "public"."BusinessClient" ADD CONSTRAINT "BusinessClient_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppointmentService" ADD CONSTRAINT "AppointmentService_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "public"."Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Note" ADD CONSTRAINT "Note_businessClientId_fkey" FOREIGN KEY ("businessClientId") REFERENCES "public"."BusinessClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
