CREATE TABLE store.item_type_maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  item_type_id uuid NOT NULL REFERENCES store.item_types(id),
  definition_id uuid NOT NULL REFERENCES maintenance.definitions(id),
  first_due_on date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  UNIQUE (item_type_id, definition_id)
);

CREATE INDEX store_item_type_maintenance_plans_active_idx
  ON store.item_type_maintenance_plans (organization_id, item_type_id)
  WHERE active;

GRANT SELECT, INSERT, UPDATE ON store.item_type_maintenance_plans TO mrmpl_web;
GRANT SELECT ON store.item_type_maintenance_plans TO mrmpl_worker, mrmpl_reporting;
