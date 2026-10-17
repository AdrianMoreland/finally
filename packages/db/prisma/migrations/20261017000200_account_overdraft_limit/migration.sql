-- The arranged overdraft of an account (0 = none).
ALTER TABLE "Account" ADD COLUMN "overdraftLimit" DECIMAL(14,2) NOT NULL DEFAULT 0;
