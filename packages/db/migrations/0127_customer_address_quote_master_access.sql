ALTER TABLE sales.customers ADD COLUMN address text;

-- New master leaves inherit the existing Quote PDF term permissions.
INSERT INTO identity.permissions (key, module, name, description)
SELECT 'masters.universal.' || term || '.' || action,
       'masters', 'Universal / ' || label || ' / ' || action,
       'Independent access to this quotation term master.'
FROM (VALUES
  ('brass_material_specs', 'Brass Material Specs'),
  ('reports', 'Reports'),
  ('taxes_and_duties', 'Taxes and Duties')
) AS terms(term, label)
CROSS JOIN unnest(ARRAY['read', 'save', 'import', 'rename', 'delete']) AS action
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT grants.role_id, target.id
FROM identity.role_permissions grants
JOIN identity.permissions source ON source.id = grants.permission_id
JOIN identity.permissions target
  ON target.key IN (
    replace(source.key, '.quoteTerm.', '.brass_material_specs.'),
    replace(source.key, '.quoteTerm.', '.reports.'),
    replace(source.key, '.quoteTerm.', '.taxes_and_duties.')
  )
WHERE source.key LIKE 'masters.universal.quoteTerm.%'
ON CONFLICT DO NOTHING;
