CREATE TABLE sales.price_master (
  organization_id uuid PRIMARY KEY REFERENCES core.organizations(id),
  prices jsonb NOT NULL CHECK (jsonb_typeof(prices) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES identity.users(id)
);
GRANT SELECT, INSERT, UPDATE ON sales.price_master TO mrmpl_web;

-- Historical product costs remain authoritative. Only newly created products
-- receive defaults until their first Product Costing save.
ALTER TABLE catalog.items ADD COLUMN price_defaults_initialized boolean NOT NULL DEFAULT true;
ALTER TABLE catalog.items ALTER COLUMN price_defaults_initialized SET DEFAULT false;
