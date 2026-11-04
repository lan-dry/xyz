-- APS-1: allow anomaly_signal action_kind (prompt injection / unexpected behavior).
ALTER TABLE event DROP CONSTRAINT IF EXISTS event_action_kind_check;
ALTER TABLE event
  ADD CONSTRAINT event_action_kind_check
  CHECK (action_kind IN (
    'tool_call',
    'llm_invocation',
    'policy_decision',
    'human_approval',
    'result',
    'provenance_claim',
    'decision',
    'data_access',
    'anomaly_signal'
  ));
