-- Rework receipt follows existing Work Order entry access, scoped by unit.
CREATE TEMP TABLE rework_permission_mapping ON COMMIT DROP AS
SELECT permission.id AS source_id,
  replace(permission.key, '.work_order.', '.rework_received.') AS new_key,
  replace(permission.name, 'Work Order', 'Rework Received') AS name
FROM identity.permissions permission
WHERE permission.key ~ '^entries\.[^.]+\.work_order\.(read|save|export)$';

INSERT INTO identity.permissions (key, module, name, description)
SELECT new_key, 'entries', name, 'Receive and view returned production pieces in this Production Unit.'
FROM rework_permission_mapping ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id, granted_at)
SELECT grant_row.role_id, target.id, grant_row.granted_at
FROM rework_permission_mapping mapping
JOIN identity.role_permissions grant_row ON grant_row.permission_id = mapping.source_id
JOIN identity.permissions target ON target.key = mapping.new_key
ON CONFLICT DO NOTHING;

INSERT INTO identity.user_permission_overrides
  (user_id, permission_id, effect, reason, assigned_by_user_id, assigned_at, expires_at)
SELECT override_row.user_id, target.id, override_row.effect, override_row.reason,
  override_row.assigned_by_user_id, override_row.assigned_at, override_row.expires_at
FROM rework_permission_mapping mapping
JOIN identity.user_permission_overrides override_row ON override_row.permission_id = mapping.source_id
JOIN identity.permissions target ON target.key = mapping.new_key
ON CONFLICT DO NOTHING;
