/*
  Warnings:

  - You are about to drop the column `isActive` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Appointment" DROP COLUMN "isActive";

-- AlterTable
ALTER TABLE "public"."Service" DROP COLUMN "isActive";

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "isActive";
