BEGIN;

DELETE FROM identity.role_permissions AS role_permissions
USING identity.roles AS roles, identity.permissions AS permissions
WHERE role_permissions.role_id = roles.id
  AND role_permissions.permission_id = permissions.id
  AND permissions.key = 'pricing.customer_default_terms.update'
  AND roles.key <> 'sales-marketing';

COMMIT;
