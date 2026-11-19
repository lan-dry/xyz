-- Tenant wipe only disables triggers named trg_%_append_only.
-- Stages 3–6 added DELETE guards named *_update_guard / *_match_guard, which
-- blocked demo:fresh. Rename them so platform_wipe_tenant can switch them off
-- for disposable is_demo / is_test tenants only.

ALTER TRIGGER trg_decision_token_update_guard
  ON decision_token
  RENAME TO trg_decision_token_append_only;

ALTER TRIGGER trg_reconciliation_exception_update_guard
  ON reconciliation_exception
  RENAME TO trg_reconciliation_exception_append_only;

ALTER TRIGGER trg_collector_cdc_event_match_guard
  ON collector_cdc_event
  RENAME TO trg_collector_cdc_event_append_only;
