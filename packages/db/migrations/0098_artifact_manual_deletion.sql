-- Artifact manual deletion access.
INSERT INTO identity.permissions (key, module, name, description)
VALUES (
  'artifacts.delete',
  'artifacts',
  'Delete Artifacts',
  'Manually delete Organization-scoped logical Artifacts with an audited reason and explicit confirmation.'
)
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM identity.roles AS roles
JOIN identity.permissions AS permissions ON permissions.key = 'artifacts.delete'
WHERE roles.key = 'administrator'
ON CONFLICT (role_id, permission_id) DO NOTHING;
