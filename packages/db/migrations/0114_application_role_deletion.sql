-- Role deletion is independent of create/edit; existing custom grants stay unchanged.
INSERT INTO identity.permissions (key, module, name, description)
VALUES (
  'administration.roles.delete',
  'administration',
  'Delete Role',
  'Delete a confirmed non-system application role and all its staff/post assignments while preserving accounts and Employee Master.'
)
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM identity.roles AS roles
JOIN identity.permissions AS permissions ON permissions.key = 'administration.roles.delete'
WHERE roles.key = 'administrator' AND roles.is_system
ON CONFLICT (role_id, permission_id) DO NOTHING;
