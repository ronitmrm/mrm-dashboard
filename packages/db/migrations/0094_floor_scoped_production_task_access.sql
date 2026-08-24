BEGIN;

CREATE TEMP TABLE production_floor_task_permissions (
  floor_code text NOT NULL,
  floor_label text NOT NULL,
  page_slug text NOT NULL,
  task_slug text NOT NULL,
  task_label text NOT NULL,
  legacy_key text NOT NULL
) ON COMMIT DROP;

INSERT INTO production_floor_task_permissions (
  floor_code,
  floor_label,
  page_slug,
  task_slug,
  task_label,
  legacy_key
)
SELECT
  floors.floor_code,
  floors.floor_label,
  tasks.page_slug,
  tasks.task_slug,
  tasks.task_label,
  tasks.legacy_key
FROM (
  VALUES
    ('conventional', 'PPAC Conventional-01'),
    ('conventional-02', 'PPAC Conventional-02'),
    ('cnc', 'PPAC CNC-01'),
    ('forging', 'PPAC Forging')
) AS floors(floor_code, floor_label)
CROSS JOIN (
  VALUES
    ('job_cards', 'dispatch_approval', 'Approve dispatch', 'operations.dispatch.write'),
    ('first_piece_inspection', 'first_piece_inspection', 'Record first-piece inspections', 'quality.first_piece.write'),
    ('quality_control_tasks', 'hourly_quality_check', 'Record hourly quality checks', 'quality.hourly.write'),
    ('job_cards', 'job_card_completion', 'Complete job-card setup', 'operations.shop_floor.write'),
    ('job_cards', 'job_card_delivery_target', 'Change job-card delivery target', 'planning.override.write'),
    ('planner_actions', 'machine_constraint', 'Manage machine constraints', 'planning.constraint.write'),
    ('machinist_tasks', 'machinist_progress', 'Progress machinist tasks', 'operations.shop_floor.write'),
    ('planner_actions', 'plan_override', 'Override machine plans', 'planning.override.write'),
    ('planner_actions', 'planner_priority', 'Change planner priorities', 'planning.priority.write'),
    ('planner_actions', 'planner_recalculation', 'Request planning recalculation', 'planning.refresh.execute'),
    ('planning_control', 'planner_workflow_resolution', 'Resolve production workflow exceptions', 'operations.shop_floor.write'),
    ('production_sessions', 'production_recording', 'Record production sessions', 'operations.production.write'),
    ('quality_control_tasks', 'quality_approval', 'Approve quality stage', 'operations.shop_floor.write'),
    ('planner_actions', 'route_change', 'Change planned routes', 'planning.route_change.write'),
    ('planning_control', 'route_selection', 'Select production routes', 'operations.route_selection.write'),
    ('machinist_tasks', 'setup_checklist', 'Complete setup checklists', 'quality.setup_checklist.write'),
    ('shop_floor_tasks', 'shop_floor_material', 'Confirm raw material at machine', 'operations.shop_floor.write')
) AS tasks(page_slug, task_slug, task_label, legacy_key);

INSERT INTO identity.permissions (key, module, name, description)
SELECT
  format(
    'operations.floors.%s.%s.%s.write',
    floor_code,
    page_slug,
    task_slug
  ),
  'operations',
  format('%s in %s', task_label, floor_label),
  format('%s under %s.', task_label, floor_label)
FROM production_floor_task_permissions
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role_permissions.role_id, new_permission.id
FROM production_floor_task_permissions mapping
JOIN identity.permissions old_permission ON old_permission.key = mapping.legacy_key
JOIN identity.role_permissions
  ON role_permissions.permission_id = old_permission.id
JOIN identity.permissions new_permission
  ON new_permission.key = format(
    'operations.floors.%s.%s.%s.write',
    mapping.floor_code,
    mapping.page_slug,
    mapping.task_slug
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
FROM production_floor_task_permissions mapping
JOIN identity.permissions old_permission ON old_permission.key = mapping.legacy_key
JOIN identity.user_permission_overrides overrides
  ON overrides.permission_id = old_permission.id
JOIN identity.permissions new_permission
  ON new_permission.key = format(
    'operations.floors.%s.%s.%s.write',
    mapping.floor_code,
    mapping.page_slug,
    mapping.task_slug
  )
ON CONFLICT (user_id, permission_id) DO NOTHING;

COMMIT;
