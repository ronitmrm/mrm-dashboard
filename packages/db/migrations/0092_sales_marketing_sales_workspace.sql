BEGIN;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM identity.roles AS roles
CROSS JOIN identity.permissions AS permissions
WHERE roles.key = 'sales-marketing'
  AND permissions.key IN (
    'pricing.sales.followups.complete',
    'pricing.sales.read'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
