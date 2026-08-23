BEGIN;

UPDATE identity.roles
SET description =
      'Assignable application administration access for administrative staff.',
    is_system = false,
    updated_at = now()
WHERE key = 'administrative';

DELETE FROM identity.role_permissions AS role_permissions
USING identity.roles AS roles, identity.permissions AS permissions
WHERE role_permissions.role_id = roles.id
  AND role_permissions.permission_id = permissions.id
  AND roles.key = 'administrative'
  AND permissions.module <> 'administration';

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM identity.roles AS roles
CROSS JOIN identity.permissions AS permissions
WHERE roles.key = 'administrative'
  AND permissions.module = 'administration'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
