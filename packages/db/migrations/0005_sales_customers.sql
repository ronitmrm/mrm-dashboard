CREATE TABLE sales.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  customer_uid text NOT NULL,
  company_name text NOT NULL,
  status text NOT NULL DEFAULT 'Active',
  contact_name text,
  email text,
  phone text,
  country text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE UNIQUE INDEX customers_uid_normalized_unique
  ON sales.customers (organization_id, lower(customer_uid));
CREATE INDEX customers_organization_status_idx
  ON sales.customers (organization_id, status);
CREATE INDEX customers_company_name_idx
  ON sales.customers (organization_id, company_name);
