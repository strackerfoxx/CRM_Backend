-- AlterTable
ALTER TABLE "public"."Business" ADD COLUMN     "businessHours" JSONB NOT NULL DEFAULT '{"monday":{"open":"09:00","close":"18:00","closed":false},"tuesday":{"open":"09:00","close":"18:00","closed":false},"wednesday":{"open":"09:00","close":"18:00","closed":false},"thursday":{"open":"09:00","close":"18:00","closed":false},"friday":{"open":"09:00","close":"18:00","closed":false},"saturday":{"open":"10:00","close":"14:00","closed":false},"sunday":{"closed":true}}',
ADD COLUMN     "specialDays" JSONB;
