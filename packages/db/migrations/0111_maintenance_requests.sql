BEGIN;

CREATE TABLE maintenance.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  requester_user_id uuid NOT NULL REFERENCES identity.users(id),
  requester_name text NOT NULL,
  department text NOT NULL,
  location text NOT NULL,
  problem_description text NOT NULL,
  suggested_category text NOT NULL
    CHECK (suggested_category IN ('Electrical', 'Plumbing', 'Mechanical')),
  requested_priority text NOT NULL
    CHECK (requested_priority IN ('Urgent', 'Regular')),
  final_category text
    CHECK (final_category IN ('Electrical', 'Plumbing', 'Mechanical')),
  final_priority text
    CHECK (final_priority IN ('Urgent', 'Regular')),
  status text NOT NULL DEFAULT 'Pending Approval'
    CHECK (status IN (
      'Pending Approval', 'Approved', 'In Progress', 'Completed', 'Closed',
      'Returned', 'Rejected'
    )),
  manager_note text,
  approved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  assigned_to_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (
    status IN ('Pending Approval', 'Returned', 'Rejected')
    OR (final_category IS NOT NULL AND final_priority IS NOT NULL)
  )
);

CREATE INDEX maintenance_requests_department_time_idx
  ON maintenance.requests (organization_id, lower(department), submitted_at DESC);

CREATE INDEX maintenance_requests_trade_work_idx
  ON maintenance.requests (
    organization_id, final_category, status, final_priority, submitted_at
  )
  WHERE status IN ('Approved', 'In Progress', 'Completed');

CREATE TABLE maintenance.request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  request_id uuid NOT NULL REFERENCES maintenance.requests(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  category text,
  priority text,
  note text,
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX maintenance_request_events_request_time_idx
  ON maintenance.request_events (request_id, occurred_at, id);

INSERT INTO identity.permissions (key, module, name, description)
VALUES
  (
    'maintenance.requests.manage', 'maintenance',
    'Manage Maintenance Requests',
    'Approve, reject, return, classify, prioritize, and close Maintenance requests.'
  ),
  (
    'maintenance.trade.electrical.work', 'maintenance',
    'Electrical Maintenance Work',
    'Open and process approved Electrical Maintenance requests.'
  ),
  (
    'maintenance.trade.plumbing.work', 'maintenance',
    'Plumbing Maintenance Work',
    'Open and process approved Plumbing Maintenance requests.'
  ),
  (
    'maintenance.trade.mechanical.work', 'maintenance',
    'Mechanical Maintenance Work',
    'Open and process approved Mechanical Maintenance requests.'
  )
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

INSERT INTO identity.roles (key, name, description, is_system)
VALUES
  (
    'maintenance-manager', 'Maintenance Manager',
    'Assignable approval and oversight access for all Maintenance requests.', false
  ),
  (
    'maintenance-electrical', 'Electrical Maintenance',
    'Assignable access to approved Electrical Maintenance work.', false
  ),
  (
    'maintenance-plumbing', 'Plumbing Maintenance',
    'Assignable access to approved Plumbing Maintenance work.', false
  ),
  (
    'maintenance-mechanical', 'Mechanical Maintenance',
    'Assignable access to scheduled and approved Mechanical Maintenance work.', false
  )
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_system = false,
    updated_at = now();

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
JOIN identity.permissions permission ON permission.key IN (
  'maintenance.requests.manage',
  'maintenance.trade.electrical.work',
  'maintenance.trade.plumbing.work',
  'maintenance.trade.mechanical.work',
  'maintenance.workspace.read',
  'maintenance.tasks.write'
)
WHERE role.key IN ('administrator', 'maintenance-manager')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
JOIN identity.permissions permission
  ON permission.key = 'maintenance.trade.electrical.work'
WHERE role.key = 'maintenance-electrical'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
JOIN identity.permissions permission
  ON permission.key = 'maintenance.trade.plumbing.work'
WHERE role.key = 'maintenance-plumbing'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
JOIN identity.permissions permission ON permission.key IN (
  'maintenance.trade.mechanical.work',
  'maintenance.workspace.read',
  'maintenance.tasks.write'
)
WHERE role.key = 'maintenance-mechanical'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
