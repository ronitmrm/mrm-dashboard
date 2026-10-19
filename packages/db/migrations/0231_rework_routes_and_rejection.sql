-- A route may belong to one rework activity instead of the shared part master.
ALTER TABLE manufacturing.route_options
  ADD COLUMN work_order_id uuid REFERENCES manufacturing.work_orders(id);
CREATE INDEX route_options_work_order_idx ON manufacturing.route_options(work_order_id)
  WHERE work_order_id IS NOT NULL;

CREATE TEMP TABLE rework_rejected_permissions ON COMMIT DROP AS
SELECT id AS source_id, replace(key, '.rework_received.', '.rework_rejected.') AS new_key,
  replace(name, 'Rework Received', 'Rework Rejected') AS name
FROM identity.permissions WHERE key ~ '^entries\.[^.]+\.rework_received\.(read|save|export)$';
INSERT INTO identity.permissions (key, module, name, description)
SELECT new_key, 'entries', name, 'Reject unsuccessful rework and create replacement production.'
FROM rework_rejected_permissions ON CONFLICT (key) DO NOTHING;
INSERT INTO identity.role_permissions (role_id, permission_id, granted_at)
SELECT grant_row.role_id, target.id, grant_row.granted_at
FROM rework_rejected_permissions mapping
JOIN identity.role_permissions grant_row ON grant_row.permission_id = mapping.source_id
JOIN identity.permissions target ON target.key = mapping.new_key ON CONFLICT DO NOTHING;
INSERT INTO identity.user_permission_overrides
  (user_id, permission_id, effect, reason, assigned_by_user_id, assigned_at, expires_at)
SELECT override_row.user_id, target.id, override_row.effect, override_row.reason,
  override_row.assigned_by_user_id, override_row.assigned_at, override_row.expires_at
FROM rework_rejected_permissions mapping
JOIN identity.user_permission_overrides override_row ON override_row.permission_id = mapping.source_id
JOIN identity.permissions target ON target.key = mapping.new_key ON CONFLICT DO NOTHING;
