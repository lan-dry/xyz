-- A5: store RFC 3161 (or local-test) timestamp tokens on Merkle witness roots.
ALTER TABLE public.merkle_root
  ADD COLUMN IF NOT EXISTS tsa_status text,
  ADD COLUMN IF NOT EXISTS tsa_authority text,
  ADD COLUMN IF NOT EXISTS tsa_url text,
  ADD COLUMN IF NOT EXISTS tsa_gen_time timestamp with time zone,
  ADD COLUMN IF NOT EXISTS tsa_token_b64 text,
  ADD COLUMN IF NOT EXISTS tsa_message_hash text,
  ADD COLUMN IF NOT EXISTS tsa_last_error text,
  ADD COLUMN IF NOT EXISTS tsa_next_attempt_at timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merkle_root_tsa_status_check'
  ) THEN
    ALTER TABLE public.merkle_root
      ADD CONSTRAINT merkle_root_tsa_status_check
      CHECK (tsa_status IS NULL OR tsa_status = ANY (ARRAY['pending'::text, 'stamped'::text]));
  END IF;
END $$;
