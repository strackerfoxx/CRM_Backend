/*
  Warnings:

  - You are about to drop the column `token` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the `RefreshToken` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[firebaseUid]` on the table `Client` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."RefreshToken" DROP CONSTRAINT "RefreshToken_userId_fkey";

-- AlterTable
ALTER TABLE "public"."Client" DROP COLUMN "token",
ADD COLUMN     "firebaseUid" TEXT;

-- DropTable
DROP TABLE "public"."RefreshToken";

-- CreateIndex
CREATE UNIQUE INDEX "Client_firebaseUid_key" ON "public"."Client"("firebaseUid");
