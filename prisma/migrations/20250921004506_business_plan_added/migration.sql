-- CreateEnum
CREATE TYPE "public"."BusinessPlan" AS ENUM ('BASIC', 'INTERMEDIATE', 'ADVANCED');

-- AlterTable
ALTER TABLE "public"."Business" ADD COLUMN     "plan" "public"."BusinessPlan" NOT NULL DEFAULT 'ADVANCED';
