-- CreateTable
CREATE TABLE "TransactionPart" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "kind" "TxKind" NOT NULL,
    "categoryId" TEXT,
    "shareOf" TEXT,
    "shareMonth" TEXT,
    "nonCash" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionPart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionPart_userId_transactionId_idx" ON "TransactionPart"("userId", "transactionId");

-- AddForeignKey
ALTER TABLE "TransactionPart" ADD CONSTRAINT "TransactionPart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionPart" ADD CONSTRAINT "TransactionPart_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionPart" ADD CONSTRAINT "TransactionPart_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Clients never talk to Postgres: RLS on, no policies, no grants for the Data API roles (same as 20261014000100_security).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;
