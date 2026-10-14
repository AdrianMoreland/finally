-- At most one OPEN categorisation request per merchant per user.
CREATE UNIQUE INDEX "CategorisationRequest_one_open_per_merchant"
  ON "CategorisationRequest" ("userId", "merchantKey")
  WHERE "status" = 'OPEN';

-- Clients never talk to Postgres: RLS on, no policies, no grants for the Data API roles.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
