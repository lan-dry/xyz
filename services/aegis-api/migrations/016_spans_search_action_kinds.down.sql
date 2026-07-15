DROP INDEX IF EXISTS idx_event_search_vector;
ALTER TABLE event DROP COLUMN IF EXISTS search_vector;
ALTER TABLE event DROP CONSTRAINT IF EXISTS event_action_kind_check;
ALTER TABLE event ADD CONSTRAINT event_action_kind_check
  CHECK (action_kind IN (
    'tool_call',
    'llm_invocation',
    'human_approval',
    'policy_decision',
    'result'
  ));
ALTER TABLE event DROP COLUMN IF EXISTS span_id;
DROP TABLE IF EXISTS span;
