BEGIN;

CREATE TABLE manufacturing.setup_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  production_floor_id uuid NOT NULL
    REFERENCES manufacturing.production_floors(id),
  name text NOT NULL CHECK (btrim(name) <> ''),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE UNIQUE INDEX setup_names_floor_name_unique
  ON manufacturing.setup_names (
    organization_id,
    production_floor_id,
    lower(btrim(name))
  );

INSERT INTO manufacturing.setup_names (
  organization_id,
  production_floor_id,
  name,
  source_system,
  source_table,
  source_id,
  source_payload
)
SELECT DISTINCT ON (
    setup.organization_id,
    route.production_floor_id,
    lower(btrim(COALESCE(setup.operation_name, setup.operation_code)))
  )
  setup.organization_id,
  route.production_floor_id,
  btrim(COALESCE(setup.operation_name, setup.operation_code)),
  'mrm-dashboard',
  'setup_name_master',
  gen_random_uuid()::text,
  jsonb_build_object(
    'setupName', btrim(COALESCE(setup.operation_name, setup.operation_code)),
    'productionFloorCode', floor.code,
    'migratedFromRouteMaster', true
  )
FROM manufacturing.operation_setups setup
JOIN manufacturing.route_options route ON route.id = setup.route_option_id
JOIN manufacturing.production_floors floor
  ON floor.id = route.production_floor_id
WHERE btrim(COALESCE(setup.operation_name, setup.operation_code, '')) <> ''
ORDER BY
  setup.organization_id,
  route.production_floor_id,
  lower(btrim(COALESCE(setup.operation_name, setup.operation_code))),
  setup.created_at,
  setup.id;

ALTER TABLE manufacturing.operation_setups
  ADD COLUMN setup_name_id uuid
    REFERENCES manufacturing.setup_names(id) ON DELETE RESTRICT;

UPDATE manufacturing.operation_setups setup
SET setup_name_id = setup_name.id
FROM manufacturing.route_options route,
  manufacturing.setup_names setup_name
WHERE route.id = setup.route_option_id
  AND setup_name.organization_id = setup.organization_id
  AND setup_name.production_floor_id = route.production_floor_id
  AND lower(btrim(setup_name.name)) =
    lower(btrim(COALESCE(setup.operation_name, setup.operation_code)));

CREATE INDEX operation_setups_setup_name_idx
  ON manufacturing.operation_setups(setup_name_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON manufacturing.setup_names TO mrmpl_web;
GRANT SELECT ON manufacturing.setup_names TO mrmpl_worker, mrmpl_reporting;

INSERT INTO derived.dashboard_source_records (
  organization_id,
  source_schema,
  source_table,
  source_id,
  source_kind,
  source_group,
  entry_type,
  changed_at,
  source_payload
)
SELECT
  organization_id,
  'manufacturing',
  'setup_names',
  source_id,
  'data_entry',
  'dataEntries',
  'setup_name_master',
  updated_at,
  source_payload
FROM manufacturing.setup_names
WHERE source_payload IS NOT NULL
ON CONFLICT (organization_id, source_schema, source_table, source_id)
DO UPDATE SET
  entry_type = EXCLUDED.entry_type,
  changed_at = EXCLUDED.changed_at,
  source_payload = EXCLUDED.source_payload;

CREATE TRIGGER sync_dashboard_source_setup_names
AFTER INSERT OR UPDATE OR DELETE ON manufacturing.setup_names
FOR EACH ROW EXECUTE FUNCTION derived.sync_dashboard_source_record(
  'data_entry',
  'dataEntries',
  'setup_name_master',
  'updated_at',
  'created_at',
  'data_entries_or_mrm'
);

INSERT INTO identity.permissions (key, module, name, description)
VALUES
  ('operations.production_dashboard.read', 'operations', 'View Production Dashboard', 'Open the Production Dashboard page.'),
  ('operations.production_sessions.read', 'operations', 'View Production Sessions', 'Open Production Sessions and event registers.'),
  ('planning.planner_actions.read', 'planning', 'View Planner Actions', 'Open planner priority, movement, and route actions.'),
  ('planning.control.read', 'planning', 'View Planning Control', 'Open planning control and route checks.'),
  ('operations.job_cards.read', 'operations', 'View Job Cards', 'Open Job Card registers and workspaces.'),
  ('planning.machine_detail.read', 'planning', 'View Machine Detail', 'Open setup-level machine planning.'),
  ('operations.shop_floor_status.read', 'operations', 'View Shop Floor Status', 'Open shop-floor machine queues.'),
  ('operations.shop_floor_tasks.read', 'operations', 'View Shop Floor Tasks', 'Open raw-material and shop-floor tasks.'),
  ('operations.machinist_tasks.read', 'operations', 'View Machinist Tasks', 'Open pre-setting, setting, and start tasks.'),
  ('quality.control_tasks.read', 'quality', 'View Quality Control Tasks', 'Open setup approval tasks.'),
  ('quality.first_piece_page.read', 'quality', 'View First Piece Inspection', 'Open first-piece inspection entry and history.'),
  ('maintenance.workspace.read', 'maintenance', 'View Mechanical Maintenance', 'Open machine maintenance schedules and history.'),
  ('operations.corrections_page.read', 'operations', 'View Production Corrections', 'Open the universal correction workspace.'),
  ('operations.master_data_entry.read', 'operations', 'View Master Data Entry', 'Open Production master entry and imports.'),
  ('operations.master_tables.read', 'operations', 'View Master Tables', 'Open Production master tables.'),
  ('operations.operational_entry.read', 'operations', 'View Operational Entry', 'Open Work Order, inward, and output entry.'),
  ('planning.part_readiness.read', 'planning', 'View Part Readiness', 'Open missing-master readiness checks.'),
  ('operations.machines.read', 'operations', 'View Machines', 'Open machine identity, assignment, and history.'),
  ('hr.masters.read', 'hr', 'View HR Masters', 'Open Department and Designation masters.'),
  ('hr.job_templates.read', 'hr', 'View Job Templates', 'Open HR Job Requirement Templates.'),
  ('hr.approved_posts.read', 'hr', 'View Approved Posts', 'Open the Approved Post page.'),
  ('hr.jobs.read', 'hr', 'View Job Posts', 'Open the recruitment openings register.'),
  ('hr.candidate_entry.read', 'hr', 'View Candidate Entry', 'Open the candidate entry page.'),
  ('hr.candidate_search.read', 'hr', 'View Candidate Search', 'Open the candidate search page.'),
  ('hr.conversations.read', 'hr', 'View Conversation History', 'Open candidate conversation history.'),
  ('hr.interview_schedule.read', 'hr', 'View Interview Schedule', 'Open the interview schedule.'),
  ('hr.interview_workspace.read', 'hr', 'View Interview Workspace', 'Open interview assessments.'),
  ('store.requests.submit', 'store', 'Submit Store requests', 'Create and release a Store request.'),
  ('store.requests.issue', 'store', 'Issue Store requests', 'Issue available stock against an approved Store request.'),
  ('store.asset_movement.write', 'store', 'Record asset movements', 'Move or return one Non Consumable Unit ID.'),
  ('store.asset_maintenance.write', 'store', 'Manage asset maintenance and calibration', 'Schedule and complete maintenance, calibration, and breakdown work.'),
  ('store.asset_repair.write', 'store', 'Manage asset repairs', 'Create and complete repair purchase orders.'),
  ('store.asset_lifecycle.write', 'store', 'Manage asset lifecycle', 'Mark a Unit ID broken, under maintenance, or scrapped.')
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

WITH permission_mapping(old_key, new_key) AS (
  VALUES
    ('operations.dashboard.read', 'operations.production_dashboard.read'),
    ('operations.dashboard.read', 'operations.production_sessions.read'),
    ('operations.dashboard.read', 'planning.planner_actions.read'),
    ('operations.dashboard.read', 'planning.control.read'),
    ('operations.dashboard.read', 'operations.job_cards.read'),
    ('operations.dashboard.read', 'planning.machine_detail.read'),
    ('operations.dashboard.read', 'operations.shop_floor_status.read'),
    ('operations.dashboard.read', 'operations.shop_floor_tasks.read'),
    ('operations.dashboard.read', 'operations.machinist_tasks.read'),
    ('operations.dashboard.read', 'quality.control_tasks.read'),
    ('operations.dashboard.read', 'quality.first_piece_page.read'),
    ('operations.dashboard.read', 'maintenance.workspace.read'),
    ('operations.dashboard.read', 'operations.corrections_page.read'),
    ('operations.dashboard.read', 'operations.master_data_entry.read'),
    ('operations.dashboard.read', 'operations.master_tables.read'),
    ('operations.dashboard.read', 'operations.operational_entry.read'),
    ('operations.dashboard.read', 'planning.part_readiness.read'),
    ('operations.dashboard.read', 'operations.machines.read'),
    ('hr.recruitment.read', 'hr.masters.read'),
    ('hr.recruitment.read', 'hr.job_templates.read'),
    ('hr.recruitment.read', 'hr.approved_posts.read'),
    ('hr.recruitment.read', 'hr.jobs.read'),
    ('hr.recruitment.read', 'hr.candidate_entry.read'),
    ('hr.recruitment.read', 'hr.candidate_search.read'),
    ('hr.recruitment.read', 'hr.conversations.read'),
    ('hr.recruitment.read', 'hr.interview_schedule.read'),
    ('hr.recruitment.read', 'hr.interview_workspace.read')
)
INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role_permissions.role_id, new_permission.id
FROM permission_mapping
JOIN identity.permissions old_permission ON old_permission.key = old_key
JOIN identity.role_permissions
  ON role_permissions.permission_id = old_permission.id
JOIN identity.permissions new_permission ON new_permission.key = new_key
ON CONFLICT (role_id, permission_id) DO NOTHING;

WITH permission_mapping(old_key, new_key) AS (
  VALUES
    ('operations.dashboard.read', 'operations.production_dashboard.read'),
    ('operations.dashboard.read', 'operations.production_sessions.read'),
    ('operations.dashboard.read', 'planning.planner_actions.read'),
    ('operations.dashboard.read', 'planning.control.read'),
    ('operations.dashboard.read', 'operations.job_cards.read'),
    ('operations.dashboard.read', 'planning.machine_detail.read'),
    ('operations.dashboard.read', 'operations.shop_floor_status.read'),
    ('operations.dashboard.read', 'operations.shop_floor_tasks.read'),
    ('operations.dashboard.read', 'operations.machinist_tasks.read'),
    ('operations.dashboard.read', 'quality.control_tasks.read'),
    ('operations.dashboard.read', 'quality.first_piece_page.read'),
    ('operations.dashboard.read', 'maintenance.workspace.read'),
    ('operations.dashboard.read', 'operations.corrections_page.read'),
    ('operations.dashboard.read', 'operations.master_data_entry.read'),
    ('operations.dashboard.read', 'operations.master_tables.read'),
    ('operations.dashboard.read', 'operations.operational_entry.read'),
    ('operations.dashboard.read', 'planning.part_readiness.read'),
    ('operations.dashboard.read', 'operations.machines.read'),
    ('hr.recruitment.read', 'hr.masters.read'),
    ('hr.recruitment.read', 'hr.job_templates.read'),
    ('hr.recruitment.read', 'hr.approved_posts.read'),
    ('hr.recruitment.read', 'hr.jobs.read'),
    ('hr.recruitment.read', 'hr.candidate_entry.read'),
    ('hr.recruitment.read', 'hr.candidate_search.read'),
    ('hr.recruitment.read', 'hr.conversations.read'),
    ('hr.recruitment.read', 'hr.interview_schedule.read'),
    ('hr.recruitment.read', 'hr.interview_workspace.read')
)
INSERT INTO identity.user_permission_overrides (
  user_id, permission_id, effect, reason, assigned_by_user_id,
  assigned_at, expires_at
)
SELECT
  override.user_id, new_permission.id, override.effect, override.reason,
  override.assigned_by_user_id, override.assigned_at, override.expires_at
FROM permission_mapping
JOIN identity.permissions old_permission ON old_permission.key = old_key
JOIN identity.user_permission_overrides override
  ON override.permission_id = old_permission.id
JOIN identity.permissions new_permission ON new_permission.key = new_key
ON CONFLICT (user_id, permission_id) DO NOTHING;

WITH permission_mapping(old_key, new_key) AS (
  VALUES
    ('store.requests.write', 'store.requests.submit'),
    ('store.requests.write', 'store.requests.issue'),
    ('store.asset_history.write', 'store.asset_movement.write'),
    ('store.asset_history.write', 'store.asset_maintenance.write'),
    ('store.asset_history.write', 'store.asset_repair.write'),
    ('store.asset_history.write', 'store.asset_lifecycle.write'),
    ('store.manage', 'store.requests.submit'),
    ('store.manage', 'store.requests.issue'),
    ('store.manage', 'store.asset_movement.write'),
    ('store.manage', 'store.asset_maintenance.write'),
    ('store.manage', 'store.asset_repair.write'),
    ('store.manage', 'store.asset_lifecycle.write')
)
INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role_permissions.role_id, new_permission.id
FROM permission_mapping
JOIN identity.permissions old_permission ON old_permission.key = old_key
JOIN identity.role_permissions
  ON role_permissions.permission_id = old_permission.id
JOIN identity.permissions new_permission ON new_permission.key = new_key
ON CONFLICT (role_id, permission_id) DO NOTHING;

WITH permission_mapping(old_key, new_key) AS (
  VALUES
    ('store.requests.write', 'store.requests.submit'),
    ('store.requests.write', 'store.requests.issue'),
    ('store.asset_history.write', 'store.asset_movement.write'),
    ('store.asset_history.write', 'store.asset_maintenance.write'),
    ('store.asset_history.write', 'store.asset_repair.write'),
    ('store.asset_history.write', 'store.asset_lifecycle.write'),
    ('store.manage', 'store.requests.submit'),
    ('store.manage', 'store.requests.issue'),
    ('store.manage', 'store.asset_movement.write'),
    ('store.manage', 'store.asset_maintenance.write'),
    ('store.manage', 'store.asset_repair.write'),
    ('store.manage', 'store.asset_lifecycle.write')
)
INSERT INTO identity.user_permission_overrides (
  user_id,
  permission_id,
  effect,
  reason,
  assigned_by_user_id,
  assigned_at,
  expires_at
)
SELECT
  overrides.user_id,
  new_permission.id,
  overrides.effect,
  overrides.reason,
  overrides.assigned_by_user_id,
  overrides.assigned_at,
  overrides.expires_at
FROM permission_mapping
JOIN identity.permissions old_permission ON old_permission.key = old_key
JOIN identity.user_permission_overrides overrides
  ON overrides.permission_id = old_permission.id
JOIN identity.permissions new_permission ON new_permission.key = new_key
ON CONFLICT (user_id, permission_id) DO NOTHING;

-- Migration 0077 granted asset history to legacy Store readers. Keep that
-- access for Store managers, but restore read-only Stock roles to product and
-- Unit-ID visibility without movement or maintenance history.
DELETE FROM identity.role_permissions asset_history_grant
USING identity.permissions asset_history,
  identity.permissions legacy_read,
  identity.role_permissions legacy_read_grant
WHERE asset_history.key = 'store.asset_history.read'
  AND asset_history_grant.permission_id = asset_history.id
  AND legacy_read.key = 'store.read'
  AND legacy_read_grant.permission_id = legacy_read.id
  AND legacy_read_grant.role_id = asset_history_grant.role_id
  AND NOT EXISTS (
    SELECT 1
    FROM identity.role_permissions manager_grant
    JOIN identity.permissions manager_permission
      ON manager_permission.id = manager_grant.permission_id
    WHERE manager_grant.role_id = asset_history_grant.role_id
      AND manager_permission.key = 'store.manage'
  );

DELETE FROM identity.user_permission_overrides asset_history_override
USING identity.permissions asset_history,
  identity.permissions legacy_read,
  identity.user_permission_overrides legacy_read_override
WHERE asset_history.key = 'store.asset_history.read'
  AND asset_history_override.permission_id = asset_history.id
  AND asset_history_override.effect = 'allow'
  AND legacy_read.key = 'store.read'
  AND legacy_read_override.permission_id = legacy_read.id
  AND legacy_read_override.user_id = asset_history_override.user_id
  AND legacy_read_override.effect = 'allow'
  AND NOT EXISTS (
    SELECT 1
    FROM identity.user_permission_overrides manager_override
    JOIN identity.permissions manager_permission
      ON manager_permission.id = manager_override.permission_id
    WHERE manager_override.user_id = asset_history_override.user_id
      AND manager_permission.key = 'store.manage'
      AND manager_override.effect = 'allow'
  );

INSERT INTO identity.roles (key, name, description, is_system)
VALUES (
  'design-team',
  'Design Team',
  'Commercial context, design work, assemblies, and drawing history.',
  false
)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
CROSS JOIN identity.permissions permission
WHERE role.key = 'design-team'
  AND permission.key IN (
    'pricing.dashboard.read',
    'pricing.customers.read',
    'pricing.enquiries.read',
    'pricing.technical_review.read',
    'pricing.design.read',
    'pricing.design.write',
    'pricing.products.read',
    'pricing.assemblies.read',
    'pricing.drawing_history.read',
    'pricing.drawing_history.write'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

ANALYZE manufacturing.setup_names;
ANALYZE manufacturing.operation_setups;

COMMIT;
