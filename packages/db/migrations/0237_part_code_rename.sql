INSERT INTO identity.permissions (key, module, name, description) VALUES
  ('masters.universal.products.rename', 'masters', 'Universal / Products / rename',
   'Rename an existing part code while retaining its identity and all linked records.')
ON CONFLICT (key) DO NOTHING;
