-- Rename legacy Attest-branded tables to Aegis (idempotent for fresh and existing DBs).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attest_policies') THEN
    ALTER TABLE attest_policies RENAME TO aegis_policies;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attest_ingest_events') THEN
    ALTER TABLE attest_ingest_events RENAME TO aegis_ingest_events;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attest_ledger_batches') THEN
    ALTER TABLE attest_ledger_batches RENAME TO aegis_ledger_batches;
  END IF;
END $$;
