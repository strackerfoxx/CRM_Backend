/*
  Warnings:

  - You are about to drop the column `clientId` on the `Appointment` table. All the data in the column will be lost.
  - Added the required column `businessClientId` to the `Appointment` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Appointment" DROP CONSTRAINT "Appointment_clientId_fkey";

-- AlterTable
ALTER TABLE "public"."Appointment" DROP COLUMN "clientId",
ADD COLUMN     "businessClientId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Appointment" ADD CONSTRAINT "Appointment_businessClientId_fkey" FOREIGN KEY ("businessClientId") REFERENCES "public"."BusinessClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
