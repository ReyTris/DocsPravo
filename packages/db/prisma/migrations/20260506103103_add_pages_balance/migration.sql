-- CreateEnum
CREATE TYPE "PageTransactionReason" AS ENUM ('signup_bonus', 'purchase', 'document_charge', 'document_refund', 'adjustment');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "pagesCharged" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "pagesGranted" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "balancePages" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PageTransaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "PageTransactionReason" NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "paymentId" UUID,
    "documentId" UUID,
    "idempotencyKey" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PageTransaction_idempotencyKey_key" ON "PageTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PageTransaction_userId_createdAt_idx" ON "PageTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PageTransaction_documentId_idx" ON "PageTransaction"("documentId");

-- CreateIndex
CREATE INDEX "PageTransaction_paymentId_idx" ON "PageTransaction"("paymentId");

-- AddForeignKey
ALTER TABLE "PageTransaction" ADD CONSTRAINT "PageTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageTransaction" ADD CONSTRAINT "PageTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageTransaction" ADD CONSTRAINT "PageTransaction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
