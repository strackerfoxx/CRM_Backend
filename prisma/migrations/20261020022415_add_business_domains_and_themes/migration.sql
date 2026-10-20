/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Business` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[domain]` on the table `Business` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "domain" TEXT,
ADD COLUMN     "pageConfig" JSONB,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "themeConfig" JSONB,
ADD COLUMN     "themeKey" TEXT NOT NULL DEFAULT 'default';

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Business_domain_key" ON "Business"("domain");
