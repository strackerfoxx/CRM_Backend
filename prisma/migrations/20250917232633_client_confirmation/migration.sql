-- AlterTable
ALTER TABLE "public"."Client" ADD COLUMN     "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "token" TEXT;
