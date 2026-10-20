/*
  Warnings:

  - Made the column `businessClientId` on table `ClientActivationToken` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ClientActivationToken" ALTER COLUMN "businessClientId" SET NOT NULL;
