-- CreateEnum
CREATE TYPE "PotType" AS ENUM ('SAFETY', 'PLANNED', 'TREAT', 'INVESTING');

-- CreateEnum
CREATE TYPE "PersonDirection" AS ENUM ('OWE', 'OWED');

-- CreateEnum
CREATE TYPE "ReviewKind" AS ENUM ('WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "CheckState" AS ENUM ('TODO', 'DONE', 'NA');

-- AlterEnum
ALTER TYPE "TxKind" ADD VALUE 'SHARE';

-- DropForeignKey
ALTER TABLE "Goal" DROP CONSTRAINT "Goal_userId_fkey";

-- DropForeignKey
ALTER TABLE "Goal" DROP CONSTRAINT "Goal_accountId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bufferAmount" DECIMAL(14,2) NOT NULL DEFAULT 150,
ADD COLUMN     "lifestyleGuard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prefs" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "salaryOnly" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "setupDoneAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "excluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "flag" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropTable
DROP TABLE "Goal";

-- CreateTable
CREATE TABLE "Pot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PotType" NOT NULL,
    "accountId" TEXT,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "target" DECIMAL(14,2),
    "targetDate" DATE,
    "monthly" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "potId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "addedOn" DATE NOT NULL,
    "boughtOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "PersonDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "since" DATE NOT NULL,
    "merchantKey" TEXT,
    "remindText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidOn" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PinnedQuestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ReviewKind" NOT NULL,
    "period" TEXT NOT NULL,
    "decision" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionSnooze" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "until" DATE NOT NULL,

    CONSTRAINT "ActionSnooze_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandingOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "state" "CheckState" NOT NULL DEFAULT 'TODO',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pot_userId_idx" ON "Pot"("userId");

-- CreateIndex
CREATE INDEX "WishlistItem_userId_idx" ON "WishlistItem"("userId");

-- CreateIndex
CREATE INDEX "Person_userId_idx" ON "Person"("userId");

-- CreateIndex
CREATE INDEX "PersonPayment_personId_idx" ON "PersonPayment"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "PinnedQuestion_userId_text_key" ON "PinnedQuestion"("userId", "text");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewLog_userId_kind_period_key" ON "ReviewLog"("userId", "kind", "period");

-- CreateIndex
CREATE UNIQUE INDEX "ActionSnooze_userId_actionId_key" ON "ActionSnooze"("userId", "actionId");

-- CreateIndex
CREATE UNIQUE INDEX "StandingOrder_userId_key_key" ON "StandingOrder"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCheck_userId_itemId_key" ON "TaxCheck"("userId", "itemId");

-- AddForeignKey
ALTER TABLE "Pot" ADD CONSTRAINT "Pot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pot" ADD CONSTRAINT "Pot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_potId_fkey" FOREIGN KEY ("potId") REFERENCES "Pot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonPayment" ADD CONSTRAINT "PersonPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonPayment" ADD CONSTRAINT "PersonPayment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedQuestion" ADD CONSTRAINT "PinnedQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionSnooze" ADD CONSTRAINT "ActionSnooze_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingOrder" ADD CONSTRAINT "StandingOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCheck" ADD CONSTRAINT "TaxCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Clients never talk to Postgres: RLS on, no policies, no grants for the Data API roles (same as 20261014000100_security).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;
