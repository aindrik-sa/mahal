-- CreateEnum
CREATE TYPE "IncomeCategory" AS ENUM ('SUBSCRIPTION', 'DONATION', 'ZAKAT', 'EVENT_COLLECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('ELECTRICITY', 'WATER', 'MAINTENANCE', 'STAFF_SALARY', 'RELIGIOUS_ACTIVITIES', 'COMMUNITY_EVENTS', 'CONSTRUCTION', 'OTHER');

-- CreateEnum
CREATE TYPE "FinanceMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');

-- AlterEnum
ALTER TYPE "FileKind" ADD VALUE 'RECEIPT';

-- AlterTable
ALTER TABLE "Masjid" ADD COLUMN     "expenseSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "financePublishedThrough" TIMESTAMP(3),
ADD COLUMN     "incomeSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openingBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openingBalanceDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "masjidId" TEXT NOT NULL,
    "txnCode" TEXT NOT NULL,
    "category" "IncomeCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "method" "FinanceMethod" NOT NULL,
    "reference" TEXT,
    "donorName" TEXT,
    "paymentId" TEXT,
    "attachmentId" TEXT,
    "recordedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "masjidId" TEXT NOT NULL,
    "txnCode" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "method" "FinanceMethod" NOT NULL,
    "reference" TEXT,
    "recipient" TEXT,
    "approvedBy" TEXT,
    "receiptId" TEXT,
    "recordedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Income_paymentId_key" ON "Income"("paymentId");

-- CreateIndex
CREATE INDEX "Income_masjidId_date_idx" ON "Income"("masjidId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Income_masjidId_txnCode_key" ON "Income"("masjidId", "txnCode");

-- CreateIndex
CREATE INDEX "Expense_masjidId_date_idx" ON "Expense"("masjidId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_masjidId_txnCode_key" ON "Expense"("masjidId", "txnCode");

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_masjidId_fkey" FOREIGN KEY ("masjidId") REFERENCES "Masjid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_masjidId_fkey" FOREIGN KEY ("masjidId") REFERENCES "Masjid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
