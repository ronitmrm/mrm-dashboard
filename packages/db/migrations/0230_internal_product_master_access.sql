-- User approved copying existing portfolio access on 2026-10-19.
CREATE TEMP TABLE product_master_access_mapping ON COMMIT DROP AS
SELECT permission.id AS source_id, target.action,
  'masters.universal.products.' || target.action AS new_key
FROM identity.permissions permission
JOIN (VALUES ('pricing.products.read', 'read'), ('pricing.design.save', 'create'),
  ('pricing.design.save', 'import')) AS target(source_key, action)
  ON permission.key = target.source_key;

INSERT INTO identity.role_permissions (role_id, permission_id, granted_at)
SELECT grant_row.role_id, target.id, grant_row.granted_at
FROM product_master_access_mapping mapping
JOIN identity.role_permissions grant_row ON grant_row.permission_id = mapping.source_id
JOIN identity.permissions target ON target.key = mapping.new_key
ON CONFLICT DO NOTHING;

INSERT INTO identity.user_permission_overrides
  (user_id, permission_id, effect, reason, assigned_by_user_id, assigned_at, expires_at)
SELECT override_row.user_id, target.id, override_row.effect, override_row.reason,
  override_row.assigned_by_user_id, override_row.assigned_at, override_row.expires_at
FROM product_master_access_mapping mapping
JOIN identity.user_permission_overrides override_row ON override_row.permission_id = mapping.source_id
JOIN identity.permissions target ON target.key = mapping.new_key
ON CONFLICT DO NOTHING;
