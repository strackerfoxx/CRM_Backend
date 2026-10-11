-- CreateTable
CREATE TABLE "ClientActivationToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientActivationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientActivationToken_tokenHash_key" ON "ClientActivationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ClientActivationToken_clientId_idx" ON "ClientActivationToken"("clientId");

-- AddForeignKey
ALTER TABLE "ClientActivationToken" ADD CONSTRAINT "ClientActivationToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
