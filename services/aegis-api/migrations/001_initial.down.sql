-- Rollback 001_initial — drops all v1 tables (ADR-0002 organization model)
BEGIN;

DROP TABLE IF EXISTS
  audit_log,
  insurance_metric,
  anomaly_score,
  webhook_endpoint,
  siem_destination,
  compliance_export,
  artifact,
  transparency_log_entry,
  inclusion_proof,
  merkle_root,
  approval,
  event,
  trace,
  approval_channel,
  policy_rule,
  policy,
  did_document,
  signing_key,
  agent,
  idempotency_record,
  ingest_api_key,
  session,
  "user",
  organization
CASCADE;

DROP EXTENSION IF EXISTS pgcrypto;

COMMIT;
