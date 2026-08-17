CREATE TABLE store.requisition_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  request_number text NOT NULL CHECK (length(btrim(request_number)) > 0),
  location_id uuid NOT NULL REFERENCES store.locations(id),
  department text NOT NULL CHECK (length(btrim(department)) > 0),
  requested_by text NOT NULL CHECK (length(btrim(requested_by)) > 0),
  required_on date,
  purpose text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX store_requisition_headers_number_unique
  ON store.requisition_headers (organization_id, lower(request_number));

INSERT INTO store.requisition_headers (
  organization_id, request_number, location_id, department, requested_by,
  required_on, purpose, created_at, updated_at,
  created_by_user_id, updated_by_user_id
)
SELECT organization_id, request_number, location_id, department, requested_by,
  required_on, purpose, created_at, updated_at,
  created_by_user_id, updated_by_user_id
FROM store.requisitions;

ALTER TABLE store.requisitions
  ADD COLUMN request_header_id uuid REFERENCES store.requisition_headers(id);

UPDATE store.requisitions line
SET request_header_id = header.id
FROM store.requisition_headers header
WHERE header.organization_id = line.organization_id
  AND lower(header.request_number) = lower(line.request_number);

ALTER TABLE store.requisitions
  ALTER COLUMN request_header_id SET NOT NULL;

CREATE INDEX store_requisitions_header_idx
  ON store.requisitions (organization_id, request_header_id, created_at);

GRANT SELECT, INSERT, UPDATE ON store.requisition_headers TO mrmpl_web;
GRANT SELECT ON store.requisition_headers TO mrmpl_worker, mrmpl_reporting;
