INSERT INTO identity.permissions (key, module, name)
VALUES (
  'operations.corrections.write',
  'operations',
  'Reverse operations and production records'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM identity.roles AS roles
CROSS JOIN identity.permissions AS permissions
WHERE roles.key = 'administrator'
  AND permissions.key = 'operations.corrections.write'
ON CONFLICT (role_id, permission_id) DO NOTHING;
