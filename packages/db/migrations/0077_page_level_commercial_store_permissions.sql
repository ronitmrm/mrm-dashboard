BEGIN;

INSERT INTO identity.permissions (key, module, name, description)
VALUES
  ('pricing.customers.read', 'pricing', 'View customers', 'Open the Customers page.'),
  ('pricing.customers.write', 'pricing', 'Manage customers', 'Create and update customers.'),
  ('pricing.products.read', 'pricing', 'View products', 'Open the Products page.'),
  ('pricing.assemblies.read', 'pricing', 'View assemblies and BOM', 'Open the Assembly / BOM page.'),
  ('pricing.assemblies.write', 'pricing', 'Manage assemblies and BOM', 'Create and update assemblies and BOM records.'),
  ('pricing.drawing_history.read', 'pricing', 'View drawing history', 'Open the Drawing History page and exports.'),
  ('pricing.drawing_history.write', 'pricing', 'Manage drawing history', 'Create and update drawing history.'),
  ('pricing.website_products.read', 'pricing', 'View website products', 'Open the Website Products page and exports.'),
  ('pricing.website_products.write', 'pricing', 'Manage website products', 'Create and update website products.'),
  ('pricing.pricing.read', 'pricing', 'View pricing register', 'Open the Pricing page and exports.'),
  ('store.overview.read', 'store', 'View Store overview', 'Open the Store Overview page.'),
  ('store.requests.read', 'store', 'View Store requests and issues', 'Open the Requests & Issues page.'),
  ('store.new_item_requests.read', 'store', 'View new Store item requests', 'Open the New Item Requests page.'),
  ('store.new_item_requests.write', 'store', 'Manage new Store item requests', 'Submit and resolve new item requests.'),
  ('store.purchase_register.read', 'store', 'View Store purchase register', 'Open the Purchase Register and purchase-order documents.'),
  ('store.purchase_register.write', 'store', 'Manage Store purchase register', 'Receive goods against purchase orders.'),
  ('store.stock.read', 'store', 'View Store stock', 'Open the Stock page and see available products and Unit IDs.'),
  ('store.stock.write', 'store', 'Manage Store stock purchasing', 'Create purchase orders from the Stock page.'),
  ('store.asset_history.read', 'store', 'View asset movement and maintenance history', 'Open a Unit ID or item workspace and see movements, maintenance, calibration, suppliers, and prices.'),
  ('store.asset_history.write', 'store', 'Manage asset movement and maintenance history', 'Record asset movements, repairs, maintenance, calibration, and lifecycle changes.'),
  ('store.masters.read', 'store', 'View Store masters', 'View Store master records from Master Data.'),
  ('store.masters.write', 'store', 'Manage Store masters', 'Create and update Store master records.')
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

WITH permission_mapping(old_key, new_key) AS (
  VALUES
    ('pricing.masters.read', 'pricing.customers.read'),
    ('pricing.masters.read', 'pricing.products.read'),
    ('pricing.masters.read', 'pricing.assemblies.read'),
    ('pricing.masters.read', 'pricing.drawing_history.read'),
    ('pricing.masters.read', 'pricing.website_products.read'),
    ('pricing.masters.write', 'pricing.customers.write'),
    ('pricing.masters.write', 'pricing.assemblies.write'),
    ('pricing.masters.write', 'pricing.drawing_history.write'),
    ('pricing.masters.write', 'pricing.website_products.write'),
    ('pricing.quotes.read', 'pricing.pricing.read'),
    ('store.read', 'store.overview.read'),
    ('store.read', 'store.requests.read'),
    ('store.read', 'store.new_item_requests.read'),
    ('store.read', 'store.purchase_register.read'),
    ('store.read', 'store.stock.read'),
    ('store.read', 'store.asset_history.read'),
    ('store.read', 'store.masters.read'),
    ('store.requests.write', 'store.new_item_requests.write'),
    ('store.manage', 'store.overview.read'),
    ('store.manage', 'store.requests.read'),
    ('store.manage', 'store.new_item_requests.read'),
    ('store.manage', 'store.purchase_register.read'),
    ('store.manage', 'store.stock.read'),
    ('store.manage', 'store.asset_history.read'),
    ('store.manage', 'store.masters.read'),
    ('store.manage', 'store.new_item_requests.write'),
    ('store.manage', 'store.purchase_register.write'),
    ('store.manage', 'store.stock.write'),
    ('store.manage', 'store.asset_history.write'),
    ('store.manage', 'store.masters.write')
)
INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role_permissions.role_id, new_permission.id
FROM permission_mapping
JOIN identity.permissions old_permission ON old_permission.key = old_key
JOIN identity.role_permissions
  ON role_permissions.permission_id = old_permission.id
JOIN identity.permissions new_permission ON new_permission.key = new_key
ON CONFLICT (role_id, permission_id) DO NOTHING;

WITH permission_mapping(old_key, new_key) AS (
  VALUES
    ('pricing.masters.read', 'pricing.customers.read'),
    ('pricing.masters.read', 'pricing.products.read'),
    ('pricing.masters.read', 'pricing.assemblies.read'),
    ('pricing.masters.read', 'pricing.drawing_history.read'),
    ('pricing.masters.read', 'pricing.website_products.read'),
    ('pricing.masters.write', 'pricing.customers.write'),
    ('pricing.masters.write', 'pricing.assemblies.write'),
    ('pricing.masters.write', 'pricing.drawing_history.write'),
    ('pricing.masters.write', 'pricing.website_products.write'),
    ('pricing.quotes.read', 'pricing.pricing.read'),
    ('store.read', 'store.overview.read'),
    ('store.read', 'store.requests.read'),
    ('store.read', 'store.new_item_requests.read'),
    ('store.read', 'store.purchase_register.read'),
    ('store.read', 'store.stock.read'),
    ('store.read', 'store.asset_history.read'),
    ('store.read', 'store.masters.read'),
    ('store.requests.write', 'store.new_item_requests.write'),
    ('store.manage', 'store.overview.read'),
    ('store.manage', 'store.requests.read'),
    ('store.manage', 'store.new_item_requests.read'),
    ('store.manage', 'store.purchase_register.read'),
    ('store.manage', 'store.stock.read'),
    ('store.manage', 'store.asset_history.read'),
    ('store.manage', 'store.masters.read'),
    ('store.manage', 'store.new_item_requests.write'),
    ('store.manage', 'store.purchase_register.write'),
    ('store.manage', 'store.stock.write'),
    ('store.manage', 'store.asset_history.write'),
    ('store.manage', 'store.masters.write')
)
INSERT INTO identity.user_permission_overrides (
  user_id,
  permission_id,
  effect,
  reason,
  assigned_by_user_id,
  assigned_at,
  expires_at
)
SELECT
  overrides.user_id,
  new_permission.id,
  overrides.effect,
  overrides.reason,
  overrides.assigned_by_user_id,
  overrides.assigned_at,
  overrides.expires_at
FROM permission_mapping
JOIN identity.permissions old_permission ON old_permission.key = old_key
JOIN identity.user_permission_overrides overrides
  ON overrides.permission_id = old_permission.id
JOIN identity.permissions new_permission ON new_permission.key = new_key
ON CONFLICT (user_id, permission_id) DO NOTHING;

COMMIT;
