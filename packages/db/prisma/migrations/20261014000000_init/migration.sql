-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BankProviderKind" AS ENUM ('ENABLE_BANKING', 'MOCK');

-- CreateEnum
CREATE TYPE "Institution" AS ENUM ('AIB', 'REVOLUT');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRING', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CURRENT', 'SAVINGS', 'VAULT', 'CARD');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'BOOKED');

-- CreateEnum
CREATE TYPE "TxKind" AS ENUM ('SPEND', 'INCOME', 'TRANSFER', 'REFUND');

-- CreateEnum
CREATE TYPE "CategorisedBy" AS ENUM ('RULE', 'USER', 'SEED', 'AI', 'NONE');

-- CreateEnum
CREATE TYPE "CategoryGroup" AS ENUM ('ESSENTIALS', 'LIFESTYLE', 'SAVINGS', 'INCOME', 'TRANSFER');

-- CreateEnum
CREATE TYPE "AskGroup" AS ENUM ('FOOD', 'TRANSPORT', 'SHOPPING', 'BILLS', 'FUN', 'OTHER');

-- CreateEnum
CREATE TYPE "RuleMatchType" AS ENUM ('EXACT', 'CONTAINS', 'REGEX');

-- CreateEnum
CREATE TYPE "RuleSource" AS ENUM ('USER', 'SEED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'ANSWERED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "Cadence" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'WATCH', 'ACT');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('ETF', 'SHARE', 'CRYPTO', 'METAL', 'CASH', 'PENSION');

-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('EXIT_TAX', 'CGT', 'NONE');

-- CreateEnum
CREATE TYPE "TaxRuleRegime" AS ENUM ('EXIT_TAX', 'CGT', 'INVESTMENT_ACCOUNT');

-- CreateEnum
CREATE TYPE "Wrapper" AS ENUM ('BROKER', 'INVESTMENT_ACCOUNT', 'PENSION');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Dublin',
    "paydayDayOfMonth" INTEGER NOT NULL DEFAULT 28,
    "monthlySavingsTarget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quietHoursStart" TEXT NOT NULL DEFAULT '22:00',
    "quietHoursEnd" TEXT NOT NULL DEFAULT '08:00',
    "targetAllocation" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "BankProviderKind" NOT NULL,
    "institution" "Institution" NOT NULL,
    "sessionIdEnc" TEXT,
    "authState" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "validUntil" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ibanMasked" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "type" "AccountType" NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balanceAt" TIMESTAMP(3),
    "includeInNetWorth" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "group" "CategoryGroup" NOT NULL,
    "askGroup" "AskGroup" NOT NULL DEFAULT 'OTHER',
    "icon" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "parentId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "defaultCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerTxId" TEXT,
    "dedupeHash" TEXT NOT NULL,
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "amountEur" DECIMAL(14,2) NOT NULL,
    "rawDescriptor" TEXT NOT NULL,
    "merchantId" TEXT,
    "categoryId" TEXT,
    "status" "TxStatus" NOT NULL DEFAULT 'BOOKED',
    "kind" "TxKind" NOT NULL DEFAULT 'SPEND',
    "transferPairId" TEXT,
    "categorisedBy" "CategorisedBy" NOT NULL DEFAULT 'NONE',
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchType" "RuleMatchType" NOT NULL,
    "pattern" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "source" "RuleSource" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorisationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "askGroup" "AskGroup" NOT NULL DEFAULT 'OTHER',
    "suggestedCategoryIds" TEXT[],
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "notifiedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategorisationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "rollover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target" DECIMAL(14,2) NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT,
    "saved" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringSeries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "cadence" "Cadence" NOT NULL,
    "expectedAmount" DECIMAL(14,2) NOT NULL,
    "lastAmount" DECIMAL(14,2) NOT NULL,
    "nextDate" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "fingerprint" TEXT NOT NULL,
    "pushedAt" TIMESTAMP(3),
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "isin" TEXT,
    "exchange" TEXT,
    "name" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "taxRegime" "TaxRegime" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL,
    "unitCost" DECIMAL(18,8) NOT NULL,
    "fees" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "wrapper" "Wrapper" NOT NULL DEFAULT 'BROKER',
    "soldAt" TIMESTAMP(3),
    "soldPrice" DECIMAL(18,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "close" DECIMAL(18,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceBar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT,
    "rule" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "fingerprint" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "regime" "TaxRuleRegime" NOT NULL,
    "rate" DECIMAL(6,4) NOT NULL,
    "annualExemption" DECIMAL(14,2),
    "threshold" DECIMAL(14,2),
    "contributionCap" DECIMAL(14,2),
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "token" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "newTxCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_authId_key" ON "User"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "BankConnection_userId_idx" ON "BankConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BankConnection_userId_provider_institution_key" ON "BankConnection"("userId", "provider", "institution");

-- CreateIndex
CREATE INDEX "Account_connectionId_idx" ON "Account"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_providerAccountId_key" ON "Account"("userId", "providerAccountId");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_slug_key" ON "Category"("userId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_userId_merchantKey_key" ON "Merchant"("userId", "merchantKey");

-- CreateIndex
CREATE INDEX "Transaction_userId_bookingDate_idx" ON "Transaction"("userId", "bookingDate");

-- CreateIndex
CREATE INDEX "Transaction_userId_merchantId_idx" ON "Transaction"("userId", "merchantId");

-- CreateIndex
CREATE INDEX "Transaction_userId_needsReview_idx" ON "Transaction"("userId", "needsReview");

-- CreateIndex
CREATE INDEX "Transaction_accountId_bookingDate_idx" ON "Transaction"("accountId", "bookingDate");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_userId_dedupeHash_key" ON "Transaction"("userId", "dedupeHash");

-- CreateIndex
CREATE INDEX "MerchantRule_userId_active_idx" ON "MerchantRule"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantRule_userId_source_matchType_pattern_key" ON "MerchantRule"("userId", "source", "matchType", "pattern");

-- CreateIndex
CREATE INDEX "CategorisationRequest_userId_status_idx" ON "CategorisationRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "CategorisationRequest_userId_merchantKey_idx" ON "CategorisationRequest"("userId", "merchantKey");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_userId_categoryId_month_key" ON "Budget"("userId", "categoryId", "month");

-- CreateIndex
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringSeries_userId_merchantId_key" ON "RecurringSeries"("userId", "merchantId");

-- CreateIndex
CREATE INDEX "Insight_userId_severity_idx" ON "Insight"("userId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "Insight_userId_fingerprint_key" ON "Insight"("userId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_userId_symbol_key" ON "Instrument"("userId", "symbol");

-- CreateIndex
CREATE INDEX "Lot_userId_instrumentId_idx" ON "Lot"("userId", "instrumentId");

-- CreateIndex
CREATE INDEX "PriceBar_userId_idx" ON "PriceBar"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBar_instrumentId_date_key" ON "PriceBar"("instrumentId", "date");

-- CreateIndex
CREATE INDEX "Signal_userId_firedAt_idx" ON "Signal"("userId", "firedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Signal_userId_fingerprint_key" ON "Signal"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "TaxRule_userId_regime_idx" ON "TaxRule"("userId", "regime");

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_userId_token_key" ON "PushDevice"("userId", "token");

-- CreateIndex
CREATE INDEX "SyncRun_connectionId_startedAt_idx" ON "SyncRun"("connectionId", "startedAt");

-- AddForeignKey
ALTER TABLE "BankConnection" ADD CONSTRAINT "BankConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorisationRequest" ADD CONSTRAINT "CategorisationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBar" ADD CONSTRAINT "PriceBar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBar" ADD CONSTRAINT "PriceBar_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

