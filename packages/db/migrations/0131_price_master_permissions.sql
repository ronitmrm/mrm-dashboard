INSERT INTO identity.permissions (key, module, name, description)
VALUES
  ('masters.universal.priceMaster.read', 'masters', 'Universal / Price Master / read', 'View grade market rates and costing defaults.'),
  ('masters.universal.priceMaster.save', 'masters', 'Universal / Price Master / save', 'Maintain grade market rates and costing defaults.')
ON CONFLICT (key) DO NOTHING;

-- Administrative access covers new masters. Sales grants remain user-managed.
INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id FROM identity.roles role CROSS JOIN identity.permissions permission
WHERE role.key = 'administrator' AND permission.key IN
  ('masters.universal.priceMaster.read', 'masters.universal.priceMaster.save')
ON CONFLICT DO NOTHING;
