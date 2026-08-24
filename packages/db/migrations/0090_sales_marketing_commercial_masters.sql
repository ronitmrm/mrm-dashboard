BEGIN;

INSERT INTO identity.permissions (key, module, name, description)
VALUES (
  'pricing.customer_default_terms.update',
  'pricing',
  'Manage Customer Default Terms',
  'Add or update Buyer, Incoterms, Payment Terms, Shipment Mode, and Packaging Terms used by Customer Commercial Defaults.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.roles (key, name, description, is_system)
VALUES (
  'sales-marketing',
  'Sales & Marketing',
  'Assignable application access for the sales and marketing team.',
  false
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM identity.roles AS roles
CROSS JOIN identity.permissions AS permissions
WHERE roles.key = 'sales-marketing'
  AND permissions.key IN (
    'pricing.customer_default_terms.update',
    'pricing.masters.read'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
