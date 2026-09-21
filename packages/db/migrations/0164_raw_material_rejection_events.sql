BEGIN;

CREATE TABLE manufacturing.raw_material_rejection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  production_floor_code text NOT NULL
    CHECK (production_floor_code IN ('conventional', 'conventional-02', 'cnc', 'forging')),
  rejected_kg numeric(20,8) NOT NULL CHECK (rejected_kg > 0),
  rejection_scope text NOT NULL CHECK (rejection_scope IN ('full', 'partial')),
  planning_action text NOT NULL
    CHECK (planning_action IN ('continue_accepted_quantity', 'wait_for_replacement')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb NOT NULL,
  UNIQUE (source_system, source_table, source_id)
);

CREATE INDEX raw_material_rejection_events_job_card_idx
  ON manufacturing.raw_material_rejection_events (
    organization_id, work_order_id, occurred_at, created_at
  );

CREATE TRIGGER sync_dashboard_source_raw_material_rejections
AFTER INSERT OR UPDATE OR DELETE ON manufacturing.raw_material_rejection_events
FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record(
  'physical', 'rawMaterialRejections', '', 'occurred_at', 'created_at', 'any'
);

INSERT INTO identity.permissions (key, module, name, description)
VALUES (
  'planning.raw_material_rejection.write',
  'planning',
  'Reject raw material',
  'Record rejected Raw Material kilograms and choose the Job Card planning outcome.'
)
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT existing.role_id, replacement.id
FROM identity.role_permissions existing
JOIN identity.permissions original
  ON original.id = existing.permission_id
 AND original.key = 'planning.override.write'
JOIN identity.permissions replacement
  ON replacement.key = 'planning.raw_material_rejection.write'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO identity.permissions (key, module, name, description)
SELECT
  'operations.floors.' || floor.code || '.planner_actions.raw_material_rejection.write',
  'operations',
  'Reject raw material in ' || floor.name,
  'Record rejected Raw Material kilograms and choose the Job Card planning outcome under ' || floor.name || '.'
FROM manufacturing.production_floors floor
GROUP BY floor.code, floor.name
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT existing.role_id, replacement.id
FROM manufacturing.production_floors floor
JOIN identity.permissions original
  ON original.key = 'operations.floors.' || floor.code || '.planner_actions.plan_override.write'
JOIN identity.role_permissions existing
  ON existing.permission_id = original.id
JOIN identity.permissions replacement
  ON replacement.key = 'operations.floors.' || floor.code || '.planner_actions.raw_material_rejection.write'
ON CONFLICT (role_id, permission_id) DO NOTHING;

GRANT SELECT, INSERT ON manufacturing.raw_material_rejection_events TO mrmpl_web;
GRANT SELECT ON manufacturing.raw_material_rejection_events TO mrmpl_reporting;

COMMIT;
