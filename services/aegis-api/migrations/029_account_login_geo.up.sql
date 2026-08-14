-- Store best-effort city/country label at login time (from IP lookup).
ALTER TABLE account_login_event
  ADD COLUMN IF NOT EXISTS geo_location TEXT;
