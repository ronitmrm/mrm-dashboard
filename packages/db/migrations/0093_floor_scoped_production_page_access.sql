BEGIN;

CREATE TEMP TABLE production_floor_page_permissions (
  floor_code text NOT NULL,
  floor_label text NOT NULL,
  page_slug text NOT NULL,
  page_label text NOT NULL,
  legacy_key text NOT NULL
) ON COMMIT DROP;

INSERT INTO production_floor_page_permissions (
  floor_code,
  floor_label,
  page_slug,
  page_label,
  legacy_key
)
SELECT floors.floor_code, floors.floor_label, pages.page_slug, pages.page_label, pages.legacy_key
FROM (
  VALUES
    ('conventional', 'PPAC Conventional-01'),
    ('conventional-02', 'PPAC Conventional-02'),
    ('cnc', 'PPAC CNC-01'),
    ('forging', 'PPAC Forging')
) AS floors(floor_code, floor_label)
CROSS JOIN (
  VALUES
    ('first_piece_inspection', 'First Piece Inspection', 'quality.first_piece_page.read'),
    ('job_cards', 'Job Cards', 'operations.job_cards.read'),
    ('machine_detail', 'Machine Detail', 'planning.machine_detail.read'),
    ('machinist_tasks', 'Machinist Tasks', 'operations.machinist_tasks.read'),
    ('part_readiness', 'Part Readiness', 'planning.part_readiness.read'),
    ('planning_control', 'Planning Control', 'planning.control.read'),
    ('planner_actions', 'Planner Actions', 'planning.planner_actions.read'),
    ('production_sessions', 'Production Sessions', 'operations.production_sessions.read'),
    ('quality_control_tasks', 'Quality Control', 'quality.control_tasks.read'),
    ('shop_floor_status', 'Shop Floor Status', 'operations.shop_floor_status.read'),
    ('shop_floor_tasks', 'Shop Floor Tasks', 'operations.shop_floor_tasks.read')
) AS pages(page_slug, page_label, legacy_key);

INSERT INTO identity.permissions (key, module, name, description)
SELECT
  format('operations.floors.%s.%s.read', floor_code, page_slug),
  'operations',
  format('View %s %s', floor_label, page_label),
  format('Open %s under %s.', page_label, floor_label)
FROM production_floor_page_permissions
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role_permissions.role_id, new_permission.id
FROM production_floor_page_permissions mapping
JOIN identity.permissions old_permission ON old_permission.key = mapping.legacy_key
JOIN identity.role_permissions
  ON role_permissions.permission_id = old_permission.id
JOIN identity.permissions new_permission
  ON new_permission.key = format(
    'operations.floors.%s.%s.read',
    mapping.floor_code,
    mapping.page_slug
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

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
FROM production_floor_page_permissions mapping
JOIN identity.permissions old_permission ON old_permission.key = mapping.legacy_key
JOIN identity.user_permission_overrides overrides
  ON overrides.permission_id = old_permission.id
JOIN identity.permissions new_permission
  ON new_permission.key = format(
    'operations.floors.%s.%s.read',
    mapping.floor_code,
    mapping.page_slug
  )
ON CONFLICT (user_id, permission_id) DO NOTHING;

COMMIT;
