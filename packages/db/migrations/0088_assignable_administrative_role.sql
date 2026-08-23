BEGIN;

INSERT INTO identity.roles (key, name, description, is_system)
VALUES (
  'administrative',
  'Administrative',
  'Full assignable application access for administrative staff.',
  false
)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_system = false,
    updated_at = now();

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM identity.roles AS roles
CROSS JOIN identity.permissions AS permissions
WHERE roles.key = 'administrative'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
