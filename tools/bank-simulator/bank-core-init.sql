-- Bank-core Postgres: separate app vs collector roles, one publication, one slot.
-- Requires wal_level=logical (see docker-compose.bank.yml).
-- Applied by bank:up after the container is healthy.

-- Application role: DML only, no REPLICATION
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bank_app') THEN
    CREATE ROLE bank_app LOGIN PASSWORD 'bank_app_dev';
  END IF;
END $$;
ALTER ROLE bank_app NOSUPERUSER NOREPLICATION NOBYPASSRLS;

-- Collector role: REPLICATION for logical decoding (not the app credential)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aegis_collector') THEN
    CREATE ROLE aegis_collector LOGIN PASSWORD 'aegis_collector_dev' REPLICATION;
  END IF;
END $$;
ALTER ROLE aegis_collector NOSUPERUSER REPLICATION;

GRANT CONNECT ON DATABASE bank_core TO bank_app, aegis_collector;
GRANT USAGE, CREATE ON SCHEMA public TO bank_app;
GRANT USAGE ON SCHEMA public TO aegis_collector;

CREATE TABLE IF NOT EXISTS bank_account (
  account_id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RWF',
  balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bank_transaction (
  txn_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES bank_account(account_id),
  case_id TEXT,
  token_id TEXT,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RWF',
  direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  status TEXT NOT NULL DEFAULT 'posted',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_txn_case ON bank_transaction(case_id);

-- FULL so UPDATE/DELETE expose before-images for CDC value matching
ALTER TABLE bank_transaction REPLICA IDENTITY FULL;
ALTER TABLE bank_account REPLICA IDENTITY FULL;

ALTER TABLE bank_account OWNER TO bank_app;
ALTER TABLE bank_transaction OWNER TO bank_app;
GRANT SELECT ON bank_account, bank_transaction TO aegis_collector;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bank_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO aegis_collector;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'aegis_collector') THEN
    CREATE PUBLICATION aegis_collector FOR TABLE bank_account, bank_transaction;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = 'aegis_collector_slot') THEN
    PERFORM pg_create_logical_replication_slot('aegis_collector_slot', 'pgoutput');
  END IF;
END $$;
