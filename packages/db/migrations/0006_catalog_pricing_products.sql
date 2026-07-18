CREATE TABLE catalog.material_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb
);

CREATE UNIQUE INDEX material_grades_organization_name_unique
  ON catalog.material_grades (organization_id, lower(name));

CREATE TABLE catalog.rod_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb
);

CREATE UNIQUE INDEX rod_types_organization_name_unique
  ON catalog.rod_types (organization_id, lower(name));

CREATE TABLE catalog.machine_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb
);

CREATE UNIQUE INDEX machine_types_organization_name_unique
  ON catalog.machine_types (organization_id, lower(name));

CREATE TABLE catalog.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  uid text NOT NULL,
  uid_kind text NOT NULL DEFAULT 'INTERNAL',
  lifecycle_status text NOT NULL DEFAULT 'P',
  description text NOT NULL,
  item_type text NOT NULL DEFAULT 'List',
  production_type text,
  material_grade_id uuid REFERENCES catalog.material_grades(id),
  rod_size text,
  rod_type_id uuid REFERENCES catalog.rod_types(id),
  die_code text,
  weight_100_pcs numeric(20, 8) NOT NULL DEFAULT 0,
  casting numeric(20, 8) NOT NULL DEFAULT 1,
  alloy_premium numeric(20, 8) NOT NULL DEFAULT 0,
  extrusion_cost numeric(20, 8) NOT NULL DEFAULT 0,
  forging_cost numeric(20, 8) NOT NULL DEFAULT 0,
  pricing_method text NOT NULL DEFAULT 'Derived',
  pieces_per_kg numeric(20, 8) NOT NULL DEFAULT 0,
  direct_purchase_price_per_kg numeric(20, 8) NOT NULL DEFAULT 0,
  direct_purchase_price_per_piece numeric(20, 8) NOT NULL DEFAULT 0,
  product_cost_inr numeric(20, 8) NOT NULL DEFAULT 0,
  machining_price_per_piece numeric(20, 8) NOT NULL DEFAULT 0,
  machine_type_id uuid REFERENCES catalog.machine_types(id),
  machining_cost numeric(20, 8) NOT NULL DEFAULT 0,
  washing numeric(20, 8) NOT NULL DEFAULT 0,
  checking numeric(20, 8) NOT NULL DEFAULT 0,
  marking numeric(20, 8) NOT NULL DEFAULT 0,
  plating numeric(20, 8) NOT NULL DEFAULT 0,
  annealing numeric(20, 8) NOT NULL DEFAULT 0,
  deburring numeric(20, 8) NOT NULL DEFAULT 0,
  buffing numeric(20, 8) NOT NULL DEFAULT 0,
  sealant numeric(20, 8) NOT NULL DEFAULT 0,
  assembly_operation_cost numeric(20, 8) NOT NULL DEFAULT 0,
  overhead_cost numeric(20, 8) NOT NULL DEFAULT 0,
  rejection_percent numeric(12, 8) NOT NULL DEFAULT 0,
  burning_loss_percent numeric(12, 8) NOT NULL DEFAULT 0,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id),
  row_version bigint NOT NULL DEFAULT 1,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  CHECK (length(btrim(uid)) > 0),
  CHECK (length(btrim(description)) > 0),
  CHECK (weight_100_pcs >= 0),
  CHECK (casting >= 0),
  CHECK (pieces_per_kg >= 0),
  CHECK (rejection_percent >= 0),
  CHECK (burning_loss_percent >= 0)
);

CREATE UNIQUE INDEX items_organization_uid_unique
  ON catalog.items (organization_id, lower(uid));

CREATE INDEX items_material_grade_id_idx
  ON catalog.items (material_grade_id);

CREATE INDEX items_rod_type_id_idx
  ON catalog.items (rod_type_id);

CREATE TABLE catalog.item_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  item_id uuid NOT NULL REFERENCES catalog.items(id) ON DELETE CASCADE,
  alias_type text NOT NULL,
  alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  CHECK (length(btrim(alias)) > 0)
);

CREATE UNIQUE INDEX item_aliases_organization_type_alias_unique
  ON catalog.item_aliases (
    organization_id,
    alias_type,
    lower(alias)
  );

CREATE INDEX item_aliases_item_id_idx
  ON catalog.item_aliases (item_id);

CREATE TABLE catalog.bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_item_id uuid NOT NULL REFERENCES catalog.items(id) ON DELETE CASCADE,
  component_item_id uuid NOT NULL REFERENCES catalog.items(id),
  quantity numeric(20, 8) NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  CHECK (quantity > 0),
  CHECK (parent_item_id <> component_item_id)
);

CREATE INDEX bom_lines_parent_item_id_idx
  ON catalog.bom_lines (parent_item_id);

CREATE INDEX bom_lines_component_item_id_idx
  ON catalog.bom_lines (component_item_id);
