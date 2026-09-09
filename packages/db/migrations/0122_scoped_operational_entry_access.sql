-- Split the three production entry types into independent unit/action grants.
-- Preserve every existing role grant and override; never derive legacy grants.
-- The migration runner owns this transaction and its checksum ledger.
LOCK TABLE identity.permissions, identity.role_permissions,
  identity.user_permission_overrides IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE operational_entry_permission_mapping (
  new_key text PRIMARY KEY,
  name text NOT NULL,
  old_key text NOT NULL
) ON COMMIT DROP;

INSERT INTO operational_entry_permission_mapping (new_key, name, old_key)
SELECT
  format('entries.%s.%s.%s', floor.code, entry.code, action.code),
  format('%s / %s / %s', floor.name, entry.name, action.name),
  CASE WHEN action.code IN ('read', 'export')
    THEN 'operations.operational_entry.read'
    ELSE entry.write_key
  END
FROM (VALUES
  ('conventional', 'Conventional-01'),
  ('conventional-02', 'Conventional-02'),
  ('cnc', 'CNC-01'),
  ('forging', 'Forging')
) AS floor(code, name)
CROSS JOIN (VALUES
  ('work_order', 'Work Order', 'operations.shop_floor.write'),
  ('rm_inward', 'RM Inward', 'operations.production.write'),
  ('software_raw', 'Software Production Output', 'operations.production.write')
) AS entry(code, name, write_key)
CROSS JOIN (VALUES
  ('read', 'View'),
  ('save', 'Save'),
  ('import', 'Import'),
  ('export', 'Export')
) AS action(code, name);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM identity.permissions WHERE key LIKE 'entries.%') THEN
    RAISE EXCEPTION 'Entry permissions already exist; review the existing configuration before cutover.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM operational_entry_permission_mapping mapping
    LEFT JOIN identity.permissions source ON source.key = mapping.old_key
    WHERE source.id IS NULL
  ) THEN
    RAISE EXCEPTION 'A source entry permission is missing; refusing an incomplete backfill.';
  END IF;
END $$;

INSERT INTO identity.permissions (key, module, name, description)
SELECT new_key, 'entries', name,
  'Independent access to this production entry and unit; grants no sibling entry or legacy permission.'
FROM operational_entry_permission_mapping;

INSERT INTO identity.role_permissions (role_id, permission_id, granted_at)
SELECT role_grant.role_id, target.id, role_grant.granted_at
FROM operational_entry_permission_mapping mapping
JOIN identity.permissions source ON source.key = mapping.old_key
JOIN identity.role_permissions role_grant ON role_grant.permission_id = source.id
JOIN identity.permissions target ON target.key = mapping.new_key;

-- Exactly one source permission maps to each target: allow/deny decisions,
-- expiry (including expired history), reason and attribution remain identical.
INSERT INTO identity.user_permission_overrides (
  user_id, permission_id, effect, reason, assigned_by_user_id,
  assigned_at, expires_at
)
SELECT overrides.user_id, target.id, overrides.effect, overrides.reason,
  overrides.assigned_by_user_id, overrides.assigned_at, overrides.expires_at
FROM operational_entry_permission_mapping mapping
JOIN identity.permissions source ON source.key = mapping.old_key
JOIN identity.user_permission_overrides overrides
  ON overrides.permission_id = source.id
JOIN identity.permissions target ON target.key = mapping.new_key;
