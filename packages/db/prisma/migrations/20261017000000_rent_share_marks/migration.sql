-- A credit can be marked as a housemate's rent share, optionally for a given rent month.
ALTER TABLE "Transaction" ADD COLUMN "shareOf" TEXT, ADD COLUMN "shareMonth" TEXT;
