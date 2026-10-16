-- Stoa app schema (logical DB: stoa / STOA_DATABASE_URL)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE stoa_tenant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stoa_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES stoa_tenant(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE stoa_thread (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES stoa_tenant(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES stoa_user(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  model_id TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX stoa_thread_user_updated ON stoa_thread (user_id, updated_at DESC);

CREATE TABLE stoa_message (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES stoa_thread(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  redaction_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX stoa_message_thread_created ON stoa_message (thread_id, created_at ASC);

CREATE TABLE stoa_audit_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES stoa_tenant(id) ON DELETE CASCADE,
  user_id UUID REFERENCES stoa_user(id) ON DELETE SET NULL,
  thread_id UUID,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX stoa_audit_tenant_created ON stoa_audit_event (tenant_id, created_at DESC);
