-- Internal org for platform-level audit events (shown in Platform Ops audit log)
BEGIN;

INSERT INTO organization (name, slug, plan, active)
SELECT 'Salanor Platform', 'salanor-platform', 'enterprise', false
WHERE NOT EXISTS (SELECT 1 FROM organization WHERE slug = 'salanor-platform');

COMMIT;
