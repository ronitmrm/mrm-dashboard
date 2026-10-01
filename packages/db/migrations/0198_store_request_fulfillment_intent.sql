ALTER TABLE store.requisition_headers
  ADD COLUMN fulfillment_kind text NOT NULL DEFAULT 'DEPARTMENT_USE'
    CHECK (fulfillment_kind IN ('DEPARTMENT_USE', 'PERSON_USE', 'STORE_TRANSFER')),
  ADD COLUMN receiving_store_id uuid REFERENCES store.accountable_stores(id),
  ADD COLUMN recipient_reference text,
  ADD COLUMN recipient_name text,
  ADD CONSTRAINT store_request_fulfillment_target CHECK (
    (fulfillment_kind = 'STORE_TRANSFER') = (receiving_store_id IS NOT NULL)
    AND (fulfillment_kind <> 'PERSON_USE' OR
      (nullif(btrim(recipient_reference), '') IS NOT NULL AND
       nullif(btrim(recipient_name), '') IS NOT NULL))
  );

ALTER TABLE store.department_stock_operations
  ADD COLUMN requisition_id uuid REFERENCES store.requisitions(id);
ALTER TABLE store.asset_accountability_transfers
  ADD COLUMN requisition_id uuid REFERENCES store.requisitions(id);

CREATE INDEX store_department_stock_operations_request_idx
  ON store.department_stock_operations (organization_id, requisition_id)
  WHERE requisition_id IS NOT NULL;
CREATE UNIQUE INDEX store_asset_accountability_transfers_request_unique
  ON store.asset_accountability_transfers (organization_id, requisition_id)
  WHERE requisition_id IS NOT NULL;

INSERT INTO identity.permissions (key, module, name, description) VALUES
  ('quality.store.request', 'quality', 'Request Quality Store stock',
    'Request stock or Unit ID responsibility for Quality Store.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.permissions (key, module, name, description)
SELECT format('operations.floors.%s.store.request', floor.code),
  'operations', format('Request %s Store stock', floor.name),
  format('Request stock or Unit ID responsibility for %s Store.', floor.name)
FROM (VALUES
  ('conventional', 'Conventional-01'),
  ('conventional-02', 'Conventional-02'),
  ('cnc', 'CNC-01'),
  ('forging', 'Forging')
) AS floor(code, name)
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
JOIN identity.permissions permission
  ON permission.key = 'quality.store.request'
    OR permission.key LIKE 'operations.floors.%.store.request'
WHERE role.key = 'administrator'
ON CONFLICT DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
JOIN identity.permissions permission
  ON permission.key = 'quality.store.request'
WHERE role.key = 'quality-assurance-hod'
ON CONFLICT DO NOTHING;
