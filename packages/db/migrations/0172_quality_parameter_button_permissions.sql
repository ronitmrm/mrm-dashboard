CREATE TEMP TABLE quality_parameter_button_mapping (
  new_key text PRIMARY KEY,
  source_key text NOT NULL,
  name text NOT NULL
) ON COMMIT DROP;

INSERT INTO quality_parameter_button_mapping (new_key, source_key, name)
SELECT
  'masters.' || floor.code || '.quality_parameter_master.' || action.code,
  'masters.' || floor.code || '.quality_parameter_master.' || action.source,
  floor.name || ' / Quality Inspection Parameter Master / ' || action.label
FROM (VALUES
  ('conventional', 'Conventional-01'),
  ('conventional-02', 'Conventional-02'),
  ('cnc', 'CNC-01'),
  ('forging', 'Forging')
) AS floor(code, name)
CROSS JOIN (VALUES
  ('download', 'read', 'Download CSV'),
  ('add', 'save', 'Add Parameter'),
  ('remove', 'save', 'Remove Parameter')
) AS action(code, source, label);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM quality_parameter_button_mapping mapping
    LEFT JOIN identity.permissions source ON source.key = mapping.source_key
    WHERE source.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Quality parameter source permissions are missing.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM quality_parameter_button_mapping mapping
    JOIN identity.permissions target ON target.key = mapping.new_key
  ) THEN
    RAISE EXCEPTION 'Quality parameter button permissions already exist.';
  END IF;
END $$;

INSERT INTO identity.permissions (key, module, name, description)
SELECT new_key, 'masters', name,
  'Independent access to this Quality Inspection Parameter Master button.'
FROM quality_parameter_button_mapping;

INSERT INTO identity.role_permissions (role_id, permission_id, granted_at)
SELECT role_grant.role_id, target.id, role_grant.granted_at
FROM quality_parameter_button_mapping mapping
JOIN identity.permissions source ON source.key = mapping.source_key
JOIN identity.role_permissions role_grant ON role_grant.permission_id = source.id
JOIN identity.permissions target ON target.key = mapping.new_key;

INSERT INTO identity.user_permission_overrides (
  user_id, permission_id, effect, reason, assigned_by_user_id,
  assigned_at, expires_at
)
SELECT override.user_id, target.id, override.effect, override.reason,
  override.assigned_by_user_id, override.assigned_at, override.expires_at
FROM quality_parameter_button_mapping mapping
JOIN identity.permissions source ON source.key = mapping.source_key
JOIN identity.user_permission_overrides override
  ON override.permission_id = source.id
JOIN identity.permissions target ON target.key = mapping.new_key;
