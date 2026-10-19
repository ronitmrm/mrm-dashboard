-- Define independent product-master permissions. Assign access explicitly.
INSERT INTO identity.permissions (key, module, name, description) VALUES
  ('masters.universal.products.read', 'masters', 'Universal / Products / read',
   'View the internal product portfolio in Master Data.'),
  ('masters.universal.products.create', 'masters', 'Universal / Products / create',
   'Register internal products without a customer or RFQ.'),
  ('masters.universal.products.import', 'masters', 'Universal / Products / import',
   'Preview and import internal product CSV files without customer links.')
ON CONFLICT (key) DO NOTHING;
