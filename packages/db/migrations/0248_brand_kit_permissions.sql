INSERT INTO identity.permissions (key, module, name, description) VALUES
  ('brand-kit.signature.read', 'brand-kit', 'View Signature', 'Open the email signature generator.'),
  ('brand-kit.guide.read', 'brand-kit', 'View Brand Guide', 'Open the internal brand guide.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
JOIN identity.permissions permission ON permission.key IN (
  'brand-kit.signature.read', 'brand-kit.guide.read'
)
WHERE role.key = 'administrator'
ON CONFLICT DO NOTHING;
