-- AlterTable
ALTER TABLE "ClientActivationToken" ADD COLUMN     "businessClientId" TEXT;

-- CreateIndex
CREATE INDEX "ClientActivationToken_businessClientId_idx" ON "ClientActivationToken"("businessClientId");

-- AddForeignKey
ALTER TABLE "ClientActivationToken" ADD CONSTRAINT "ClientActivationToken_businessClientId_fkey" FOREIGN KEY ("businessClientId") REFERENCES "BusinessClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
