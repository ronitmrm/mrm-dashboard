-- Complete the canonical bounded-context schema before any full source load.

ALTER TABLE core.organizations
  ADD COLUMN created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0);

ALTER TABLE core.number_sequences
  ADD COLUMN created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0);

ALTER TABLE core.files
  ADD COLUMN created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0);

ALTER TABLE core.file_links
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0);

ALTER TABLE catalog.material_grades
  ADD COLUMN created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0);

ALTER TABLE catalog.rod_types
  ADD COLUMN created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0);

ALTER TABLE catalog.machine_types
  ADD COLUMN created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0);

ALTER TABLE catalog.item_aliases
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0);

ALTER TABLE catalog.bom_lines
  ADD COLUMN organization_id uuid REFERENCES core.organizations(id),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0);

UPDATE catalog.bom_lines AS lines
SET organization_id = items.organization_id
FROM catalog.items AS items
WHERE items.id = lines.parent_item_id
  AND lines.organization_id IS NULL;

ALTER TABLE catalog.bom_lines
  ALTER COLUMN organization_id SET NOT NULL;

CREATE UNIQUE INDEX material_grades_source_unique
  ON catalog.material_grades (source_system, source_table, source_id);
CREATE UNIQUE INDEX rod_types_source_unique
  ON catalog.rod_types (source_system, source_table, source_id);
CREATE UNIQUE INDEX machine_types_source_unique
  ON catalog.machine_types (source_system, source_table, source_id);
CREATE UNIQUE INDEX items_source_unique
  ON catalog.items (source_system, source_table, source_id);
CREATE UNIQUE INDEX item_aliases_source_unique
  ON catalog.item_aliases (source_system, source_table, source_id);
CREATE UNIQUE INDEX bom_lines_source_unique
  ON catalog.bom_lines (source_system, source_table, source_id);

CREATE TABLE catalog.item_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
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

CREATE UNIQUE INDEX item_categories_name_unique
  ON catalog.item_categories (organization_id, lower(name));

CREATE TABLE catalog.item_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  category_id uuid NOT NULL REFERENCES catalog.item_categories(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
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

CREATE UNIQUE INDEX item_subcategories_name_unique
  ON catalog.item_subcategories (category_id, lower(name));

CREATE TABLE catalog.design_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
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

CREATE UNIQUE INDEX design_processes_name_unique
  ON catalog.design_processes (organization_id, lower(name));

CREATE TABLE catalog.machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  machine_number text NOT NULL CHECK (length(btrim(machine_number)) > 0),
  name text,
  machine_type_id uuid REFERENCES catalog.machine_types(id),
  active boolean NOT NULL DEFAULT true,
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

CREATE UNIQUE INDEX machines_number_unique
  ON catalog.machines (organization_id, lower(machine_number));
CREATE INDEX machines_type_idx ON catalog.machines (machine_type_id);

CREATE TABLE catalog.drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  item_id uuid NOT NULL REFERENCES catalog.items(id),
  revision text NOT NULL,
  drawing_number text,
  status text NOT NULL DEFAULT 'current',
  file_id uuid REFERENCES core.files(id),
  effective_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (item_id, revision)
);

CREATE INDEX drawings_item_idx ON catalog.drawings (item_id);

CREATE TABLE catalog.website_product_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  item_id uuid NOT NULL REFERENCES catalog.items(id),
  title text NOT NULL,
  slug text,
  summary text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (item_id)
);

CREATE UNIQUE INDEX website_product_profiles_slug_unique
  ON catalog.website_product_profiles (organization_id, lower(slug))
  WHERE slug IS NOT NULL;

CREATE TABLE catalog.website_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL,
  description text,
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

CREATE UNIQUE INDEX website_applications_name_unique
  ON catalog.website_applications (organization_id, lower(name));

CREATE TABLE catalog.website_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL,
  description text,
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

CREATE UNIQUE INDEX website_certifications_name_unique
  ON catalog.website_certifications (organization_id, lower(name));

CREATE TABLE catalog.website_field_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  field_key text NOT NULL,
  option_value text NOT NULL,
  label text NOT NULL,
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (organization_id, field_key, option_value)
);

CREATE TABLE sales.customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  customer_id uuid NOT NULL REFERENCES sales.customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  designation text,
  is_primary boolean NOT NULL DEFAULT false,
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

CREATE INDEX customer_contacts_customer_idx
  ON sales.customer_contacts (customer_id);

CREATE TABLE sales.enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  enquiry_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES sales.customers(id),
  received_on date NOT NULL,
  status text NOT NULL DEFAULT 'Open',
  subject text,
  customer_reference text,
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

CREATE UNIQUE INDEX enquiries_number_unique
  ON sales.enquiries (organization_id, lower(enquiry_number));
CREATE INDEX enquiries_customer_status_idx
  ON sales.enquiries (customer_id, status);

CREATE TABLE sales.enquiry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  enquiry_id uuid NOT NULL REFERENCES sales.enquiries(id) ON DELETE CASCADE,
  line_number integer NOT NULL CHECK (line_number > 0),
  customer_part_code text,
  description text NOT NULL,
  quantity numeric(20,8) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  target_price numeric(18,6),
  item_id uuid REFERENCES catalog.items(id),
  status text NOT NULL DEFAULT 'Open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (enquiry_id, line_number)
);

CREATE INDEX enquiry_items_item_idx ON sales.enquiry_items (item_id);

CREATE TABLE sales.enquiry_item_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  enquiry_item_id uuid NOT NULL REFERENCES sales.enquiry_items(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  description text NOT NULL,
  quantity numeric(20,8) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  customer_part_code text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (enquiry_item_id, revision)
);

CREATE TABLE sales.design_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  enquiry_item_id uuid NOT NULL REFERENCES sales.enquiry_items(id),
  design_process_id uuid REFERENCES catalog.design_processes(id),
  assigned_to_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Pending',
  due_on date,
  completed_at timestamptz,
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

CREATE TABLE sales.design_bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  design_task_id uuid NOT NULL REFERENCES sales.design_tasks(id) ON DELETE CASCADE,
  parent_line_id uuid REFERENCES sales.design_bom_lines(id) ON DELETE CASCADE,
  component_code text NOT NULL,
  description text,
  quantity numeric(20,8) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
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

CREATE TABLE sales.clarification_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  enquiry_id uuid NOT NULL REFERENCES sales.enquiries(id) ON DELETE CASCADE,
  enquiry_item_id uuid REFERENCES sales.enquiry_items(id) ON DELETE CASCADE,
  question text NOT NULL,
  response text,
  status text NOT NULL DEFAULT 'Open',
  due_on date,
  resolved_at timestamptz,
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

CREATE TABLE sales.enquiry_import_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  file_id uuid REFERENCES core.files(id),
  status text NOT NULL DEFAULT 'Pending',
  imported_at timestamptz,
  summary text,
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

CREATE TABLE sales.enquiry_import_review_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  review_id uuid NOT NULL REFERENCES sales.enquiry_import_reviews(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number > 0),
  status text NOT NULL,
  raw_values jsonb NOT NULL,
  matched_customer_id uuid REFERENCES sales.customers(id),
  matched_item_id uuid REFERENCES catalog.items(id),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (review_id, row_number)
);

CREATE TABLE sales.followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  enquiry_id uuid NOT NULL REFERENCES sales.enquiries(id) ON DELETE CASCADE,
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'Pending',
  note text NOT NULL,
  completed_at timestamptz,
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

CREATE TABLE sales.material_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  material_grade_id uuid NOT NULL REFERENCES catalog.material_grades(id),
  effective_on date NOT NULL,
  rate_per_kg numeric(18,6) NOT NULL CHECK (rate_per_kg >= 0),
  currency_code text NOT NULL DEFAULT 'INR',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (organization_id, material_grade_id, effective_on)
);

CREATE TABLE sales.shipping_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL,
  amount numeric(18,6) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  active boolean NOT NULL DEFAULT true,
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

CREATE UNIQUE INDEX shipping_terms_name_unique
  ON sales.shipping_terms (organization_id, lower(name));

CREATE TABLE sales.packaging_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL,
  amount numeric(18,6) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  active boolean NOT NULL DEFAULT true,
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

CREATE UNIQUE INDEX packaging_options_name_unique
  ON sales.packaging_options (organization_id, lower(name));

CREATE TABLE sales.commercial_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL,
  value text NOT NULL,
  active boolean NOT NULL DEFAULT true,
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

CREATE TABLE sales.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  quote_number text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  enquiry_item_id uuid REFERENCES sales.enquiry_items(id),
  customer_id uuid NOT NULL REFERENCES sales.customers(id),
  item_id uuid NOT NULL REFERENCES catalog.items(id),
  lineage_item_id uuid NOT NULL REFERENCES catalog.items(id),
  customer_part_code text,
  quantity numeric(20,8) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit_price numeric(18,6) NOT NULL CHECK (unit_price >= 0),
  currency_code text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Sent', 'Accepted', 'Superseded', 'Cancelled')),
  is_active boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  superseded_by_quote_item_id uuid REFERENCES sales.quote_items(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (organization_id, quote_number, revision)
);

CREATE UNIQUE INDEX quote_items_active_price_unique
  ON sales.quote_items (
    organization_id,
    customer_id,
    lower(customer_part_code),
    lineage_item_id
  )
  WHERE is_active AND customer_part_code IS NOT NULL;
CREATE INDEX quote_items_customer_status_idx
  ON sales.quote_items (customer_id, status);

CREATE TABLE sales.quote_product_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  quote_item_id uuid NOT NULL UNIQUE REFERENCES sales.quote_items(id) ON DELETE CASCADE,
  item_uid text NOT NULL,
  description text NOT NULL,
  item_type text NOT NULL,
  production_type text,
  weight_100_pcs numeric(20,8) NOT NULL DEFAULT 0,
  pieces_per_kg numeric(20,8) NOT NULL DEFAULT 0,
  material_rate numeric(18,6) NOT NULL DEFAULT 0,
  material_cost numeric(18,6) NOT NULL DEFAULT 0,
  conversion_cost numeric(18,6) NOT NULL DEFAULT 0,
  packaging_cost numeric(18,6) NOT NULL DEFAULT 0,
  shipping_cost numeric(18,6) NOT NULL DEFAULT 0,
  overhead_cost numeric(18,6) NOT NULL DEFAULT 0,
  rejection_cost numeric(18,6) NOT NULL DEFAULT 0,
  total_cost numeric(18,6) NOT NULL DEFAULT 0,
  quoted_price numeric(18,6) NOT NULL DEFAULT 0,
  calculation_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE TABLE sales.quote_package_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  quote_product_snapshot_id uuid NOT NULL REFERENCES sales.quote_product_snapshots(id) ON DELETE CASCADE,
  component_item_id uuid REFERENCES catalog.items(id),
  component_uid text NOT NULL,
  description text,
  quantity numeric(20,8) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(18,6) NOT NULL DEFAULT 0,
  extended_cost numeric(18,6) NOT NULL DEFAULT 0,
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE TABLE sales.quote_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  quote_item_id uuid NOT NULL REFERENCES sales.quote_items(id) ON DELETE CASCADE,
  term_type text NOT NULL,
  label text NOT NULL,
  value text NOT NULL,
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (quote_item_id, term_type, sequence)
);

CREATE TABLE sales.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  customer_id uuid NOT NULL REFERENCES sales.customers(id),
  po_number text NOT NULL,
  po_date date NOT NULL,
  status text NOT NULL DEFAULT 'Imported',
  currency_code text NOT NULL DEFAULT 'INR',
  total_amount numeric(18,6) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  file_id uuid REFERENCES core.files(id),
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

CREATE UNIQUE INDEX purchase_orders_number_unique
  ON sales.purchase_orders (organization_id, customer_id, lower(po_number));

CREATE TABLE sales.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  purchase_order_id uuid NOT NULL REFERENCES sales.purchase_orders(id) ON DELETE CASCADE,
  line_number integer NOT NULL CHECK (line_number > 0),
  customer_part_code text NOT NULL,
  description text,
  quantity numeric(20,8) NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,6) NOT NULL CHECK (unit_price >= 0),
  quote_item_id uuid REFERENCES sales.quote_items(id),
  match_status text NOT NULL DEFAULT 'Unmatched',
  match_evidence jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (purchase_order_id, line_number)
);

CREATE TABLE sales.proforma_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  purchase_order_id uuid NOT NULL REFERENCES sales.purchase_orders(id),
  invoice_number text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status text NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Approved', 'Cancelled', 'Superseded')),
  invoice_date date NOT NULL,
  total_amount numeric(18,6) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (organization_id, invoice_number, revision)
);

CREATE TABLE sales.proforma_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  proforma_invoice_id uuid NOT NULL REFERENCES sales.proforma_invoices(id) ON DELETE CASCADE,
  purchase_order_line_id uuid NOT NULL REFERENCES sales.purchase_order_lines(id),
  quote_item_id uuid NOT NULL REFERENCES sales.quote_items(id),
  line_number integer NOT NULL CHECK (line_number > 0),
  quantity numeric(20,8) NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,6) NOT NULL CHECK (unit_price >= 0),
  line_amount numeric(18,6) NOT NULL CHECK (line_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (proforma_invoice_id, line_number)
);

CREATE TABLE sales.bulk_price_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  revision_number text NOT NULL,
  status text NOT NULL DEFAULT 'Draft',
  reason text NOT NULL,
  effective_on date NOT NULL,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (organization_id, revision_number)
);

CREATE TABLE sales.bulk_price_revision_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  bulk_price_revision_id uuid NOT NULL REFERENCES sales.bulk_price_revisions(id) ON DELETE CASCADE,
  prior_quote_item_id uuid NOT NULL REFERENCES sales.quote_items(id),
  replacement_quote_item_id uuid REFERENCES sales.quote_items(id),
  old_price numeric(18,6) NOT NULL,
  new_price numeric(18,6) NOT NULL,
  calculation_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE TABLE sales.engineering_change_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  ecn_number text NOT NULL,
  item_id uuid NOT NULL REFERENCES catalog.items(id),
  status text NOT NULL DEFAULT 'Open',
  reason text NOT NULL,
  effective_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (organization_id, ecn_number)
);

CREATE TABLE sales.engineering_change_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  engineering_change_note_id uuid NOT NULL REFERENCES sales.engineering_change_notes(id) ON DELETE CASCADE,
  affected_item_id uuid NOT NULL REFERENCES catalog.items(id),
  decision text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  decided_at timestamptz NOT NULL DEFAULT now(),
  decided_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE TABLE manufacturing.work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_number text NOT NULL,
  job_card_number text NOT NULL,
  item_id uuid NOT NULL REFERENCES catalog.items(id),
  ordered_quantity numeric(20,8) NOT NULL CHECK (ordered_quantity > 0),
  completed_quantity numeric(20,8) NOT NULL DEFAULT 0 CHECK (completed_quantity >= 0),
  order_date date,
  due_date date,
  status text NOT NULL DEFAULT 'Open',
  customer_id uuid REFERENCES sales.customers(id),
  purchase_order_line_id uuid REFERENCES sales.purchase_order_lines(id),
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

CREATE UNIQUE INDEX work_orders_number_unique
  ON manufacturing.work_orders (organization_id, lower(work_order_number));
CREATE UNIQUE INDEX work_orders_job_card_unique
  ON manufacturing.work_orders (organization_id, lower(job_card_number));
CREATE INDEX work_orders_item_status_idx
  ON manufacturing.work_orders (item_id, status);

CREATE TABLE manufacturing.raw_material_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  receipt_number text NOT NULL,
  material_grade_id uuid REFERENCES catalog.material_grades(id),
  rod_type_id uuid REFERENCES catalog.rod_types(id),
  heat_number text,
  supplier_name text,
  received_on date NOT NULL,
  quantity_kg numeric(20,8) NOT NULL CHECK (quantity_kg > 0),
  remaining_quantity_kg numeric(20,8) NOT NULL CHECK (remaining_quantity_kg >= 0),
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

CREATE UNIQUE INDEX raw_material_receipts_number_unique
  ON manufacturing.raw_material_receipts (organization_id, lower(receipt_number));

CREATE TABLE manufacturing.route_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  item_id uuid NOT NULL REFERENCES catalog.items(id),
  route_code text NOT NULL,
  name text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (item_id, route_code, revision)
);

CREATE TABLE manufacturing.operation_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  route_option_id uuid NOT NULL REFERENCES manufacturing.route_options(id) ON DELETE CASCADE,
  setup_number integer NOT NULL CHECK (setup_number > 0),
  operation_code text NOT NULL,
  operation_name text,
  machine_type_id uuid REFERENCES catalog.machine_types(id),
  sequence integer NOT NULL CHECK (sequence > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (route_option_id, setup_number),
  UNIQUE (route_option_id, sequence)
);

CREATE INDEX operation_setups_machine_type_idx
  ON manufacturing.operation_setups (machine_type_id);

CREATE TABLE manufacturing.operation_cycle_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  operation_setup_id uuid NOT NULL REFERENCES manufacturing.operation_setups(id) ON DELETE CASCADE,
  cycle_time_seconds numeric(20,8) NOT NULL CHECK (cycle_time_seconds > 0),
  pieces_per_cycle numeric(20,8) NOT NULL DEFAULT 1 CHECK (pieces_per_cycle > 0),
  setup_time_minutes numeric(20,8) NOT NULL DEFAULT 0 CHECK (setup_time_minutes >= 0),
  effective_from date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE TABLE manufacturing.operation_tooling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  operation_setup_id uuid NOT NULL REFERENCES manufacturing.operation_setups(id) ON DELETE CASCADE,
  tool_code text NOT NULL,
  description text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (operation_setup_id, tool_code)
);

CREATE TABLE manufacturing.route_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  route_option_id uuid NOT NULL REFERENCES manufacturing.route_options(id),
  selected_at timestamptz NOT NULL DEFAULT now(),
  selected_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  reason text,
  supersedes_selection_id uuid REFERENCES manufacturing.route_selections(id),
  reversed_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE UNIQUE INDEX route_selections_current_unique
  ON manufacturing.route_selections (work_order_id)
  WHERE reversed_at IS NULL;

CREATE TABLE manufacturing.production_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  route_option_id uuid REFERENCES manufacturing.route_options(id),
  operation_setup_id uuid REFERENCES manufacturing.operation_setups(id),
  machine_id uuid REFERENCES catalog.machines(id),
  operator_employee_id uuid,
  production_date date NOT NULL,
  shift text,
  quantity_good numeric(20,8) NOT NULL DEFAULT 0 CHECK (quantity_good >= 0),
  quantity_rejected numeric(20,8) NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  reversed_at timestamptz,
  reversal_reason text,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE INDEX production_entries_work_order_date_idx
  ON manufacturing.production_entries (work_order_id, production_date);
CREATE INDEX production_entries_machine_date_idx
  ON manufacturing.production_entries (machine_id, production_date);

CREATE TABLE manufacturing.production_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  card_number text NOT NULL,
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  route_option_id uuid REFERENCES manufacturing.route_options(id),
  status text NOT NULL DEFAULT 'Open',
  issued_on date NOT NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (organization_id, card_number)
);

CREATE TABLE manufacturing.production_card_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  production_card_id uuid NOT NULL REFERENCES manufacturing.production_cards(id),
  event_type text NOT NULL,
  operation_setup_id uuid REFERENCES manufacturing.operation_setups(id),
  machine_id uuid REFERENCES catalog.machines(id),
  event_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  reversed_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE TABLE manufacturing.shop_floor_setup_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  route_option_id uuid NOT NULL REFERENCES manufacturing.route_options(id),
  operation_setup_id uuid NOT NULL REFERENCES manufacturing.operation_setups(id),
  machine_id uuid REFERENCES catalog.machines(id),
  stage text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (work_order_id, route_option_id, operation_setup_id)
);

CREATE UNIQUE INDEX shop_floor_active_machine_unique
  ON manufacturing.shop_floor_setup_state (machine_id)
  WHERE active AND machine_id IS NOT NULL;

CREATE TABLE manufacturing.shop_floor_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  setup_state_id uuid NOT NULL REFERENCES manufacturing.shop_floor_setup_state(id),
  from_stage text,
  to_stage text NOT NULL,
  machine_id uuid REFERENCES catalog.machines(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  reason text,
  reversed_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE TABLE manufacturing.planner_priority_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  planning_date date NOT NULL,
  machine_id uuid REFERENCES catalog.machines(id),
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  reversed_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE TABLE manufacturing.planner_priority_event_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  planner_priority_event_id uuid NOT NULL REFERENCES manufacturing.planner_priority_events(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  operation_setup_id uuid REFERENCES manufacturing.operation_setups(id),
  prior_position integer,
  target_position integer NOT NULL CHECK (target_position >= 0),
  planned_date date,
  blocker_code text,
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  UNIQUE (planner_priority_event_id, work_order_id, operation_setup_id)
);

CREATE TABLE manufacturing.machine_constraint_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  machine_id uuid NOT NULL REFERENCES catalog.machines(id),
  constraint_type text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  reversed_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE manufacturing.machine_constraint_event_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  machine_constraint_event_id uuid NOT NULL REFERENCES manufacturing.machine_constraint_events(id) ON DELETE CASCADE,
  work_order_id uuid REFERENCES manufacturing.work_orders(id),
  operation_setup_id uuid REFERENCES manufacturing.operation_setups(id),
  impact_type text NOT NULL,
  planned_date date,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE manufacturing.plan_override_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  operation_setup_id uuid REFERENCES manufacturing.operation_setups(id),
  source_machine_id uuid REFERENCES catalog.machines(id),
  target_machine_id uuid REFERENCES catalog.machines(id),
  target_date date,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  reversed_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE TABLE manufacturing.plan_override_event_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  plan_override_event_id uuid NOT NULL REFERENCES manufacturing.plan_override_events(id) ON DELETE CASCADE,
  detail_type text NOT NULL,
  related_work_order_id uuid REFERENCES manufacturing.work_orders(id),
  related_setup_id uuid REFERENCES manufacturing.operation_setups(id),
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE manufacturing.route_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  from_route_option_id uuid REFERENCES manufacturing.route_options(id),
  to_route_option_id uuid NOT NULL REFERENCES manufacturing.route_options(id),
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  reversed_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE TABLE manufacturing.route_change_event_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  route_change_event_id uuid NOT NULL REFERENCES manufacturing.route_change_events(id) ON DELETE CASCADE,
  operation_setup_id uuid REFERENCES manufacturing.operation_setups(id),
  setup_number integer NOT NULL CHECK (setup_number > 0),
  disposition text NOT NULL,
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0)
);

CREATE TABLE manufacturing.dispatch_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected', 'cancelled')),
  quantity numeric(20,8) CHECK (quantity IS NULL OR quantity >= 0),
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  reversed_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE TABLE manufacturing.setup_completion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  operation_setup_id uuid NOT NULL REFERENCES manufacturing.operation_setups(id),
  machine_id uuid REFERENCES catalog.machines(id),
  completed_at timestamptz NOT NULL,
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  notes text,
  reversed_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE TABLE manufacturing.planning_calendar_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  exception_date date NOT NULL,
  exception_type text NOT NULL,
  name text NOT NULL,
  working_minutes integer CHECK (working_minutes IS NULL OR working_minutes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (organization_id, exception_date, exception_type)
);

CREATE TABLE manufacturing.downtime_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
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

CREATE UNIQUE INDEX downtime_reasons_code_unique
  ON manufacturing.downtime_reasons (organization_id, lower(code));

CREATE TABLE workforce.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  employee_code text NOT NULL,
  name text NOT NULL,
  department text,
  designation text,
  user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  joined_on date,
  left_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  CHECK (left_on IS NULL OR joined_on IS NULL OR left_on >= joined_on)
);

CREATE UNIQUE INDEX employees_code_unique
  ON workforce.employees (organization_id, lower(employee_code));
CREATE UNIQUE INDEX employees_user_unique
  ON workforce.employees (user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE manufacturing.production_entries
  ADD CONSTRAINT production_entries_operator_employee_fk
  FOREIGN KEY (operator_employee_id)
  REFERENCES workforce.employees(id);

CREATE TABLE workforce.employee_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  employee_id uuid NOT NULL REFERENCES workforce.employees(id) ON DELETE CASCADE,
  alias_type text NOT NULL,
  alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE UNIQUE INDEX employee_aliases_value_unique
  ON workforce.employee_aliases (organization_id, alias_type, lower(alias));

CREATE TABLE workforce.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  employee_id uuid NOT NULL REFERENCES workforce.employees(id),
  attendance_date date NOT NULL,
  shift text,
  status text NOT NULL,
  clock_in time,
  clock_out time,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  reversed_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (employee_id, attendance_date, shift)
);

CREATE INDEX attendance_records_date_idx
  ON workforce.attendance_records (organization_id, attendance_date);

CREATE TABLE workforce.training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  employee_id uuid NOT NULL REFERENCES workforce.employees(id),
  trainer_employee_id uuid REFERENCES workforce.employees(id),
  topic text NOT NULL,
  training_date date NOT NULL,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  result text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_trainer text,
  reversed_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE TABLE quality.rejection_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
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

CREATE UNIQUE INDEX rejection_types_code_unique
  ON quality.rejection_types (organization_id, lower(code));

CREATE TABLE quality.rejection_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  rejection_type_id uuid NOT NULL REFERENCES quality.rejection_types(id),
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (rejection_type_id, code)
);

CREATE TABLE quality.rejection_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  rejection_reason_id uuid NOT NULL REFERENCES quality.rejection_reasons(id),
  code text NOT NULL,
  remark text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (rejection_reason_id, code)
);

CREATE TABLE quality.parameter_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  item_id uuid NOT NULL REFERENCES catalog.items(id),
  route_option_id uuid NOT NULL REFERENCES manufacturing.route_options(id),
  operation_setup_id uuid NOT NULL REFERENCES manufacturing.operation_setups(id),
  parameter_code text NOT NULL,
  name text NOT NULL,
  data_type text NOT NULL CHECK (data_type IN ('numeric', 'text', 'boolean')),
  unit text,
  lower_limit numeric(20,8),
  upper_limit numeric(20,8),
  nominal_value numeric(20,8),
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  CHECK (upper_limit IS NULL OR lower_limit IS NULL OR upper_limit >= lower_limit)
);

CREATE UNIQUE INDEX quality_parameter_scope_unique
  ON quality.parameter_definitions (
    item_id,
    route_option_id,
    operation_setup_id,
    lower(parameter_code)
  );

CREATE TABLE quality.first_piece_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  operation_setup_id uuid NOT NULL REFERENCES manufacturing.operation_setups(id),
  machine_id uuid REFERENCES catalog.machines(id),
  inspected_at timestamptz NOT NULL,
  status text NOT NULL,
  inspector_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_inspector text,
  notes text,
  reversed_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE TABLE quality.first_piece_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  inspection_id uuid NOT NULL REFERENCES quality.first_piece_inspections(id) ON DELETE CASCADE,
  parameter_definition_id uuid NOT NULL REFERENCES quality.parameter_definitions(id),
  numeric_value numeric(20,8),
  text_value text,
  boolean_value boolean,
  result text NOT NULL,
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  UNIQUE (inspection_id, parameter_definition_id)
);

CREATE TABLE quality.hourly_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  operation_setup_id uuid NOT NULL REFERENCES manufacturing.operation_setups(id),
  machine_id uuid REFERENCES catalog.machines(id),
  checked_at timestamptz NOT NULL,
  status text NOT NULL,
  checker_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_checker text,
  reversed_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE INDEX hourly_checks_setup_time_idx
  ON quality.hourly_checks (operation_setup_id, checked_at);

CREATE TABLE quality.hourly_check_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  hourly_check_id uuid NOT NULL REFERENCES quality.hourly_checks(id) ON DELETE CASCADE,
  parameter_definition_id uuid NOT NULL REFERENCES quality.parameter_definitions(id),
  numeric_value numeric(20,8),
  text_value text,
  boolean_value boolean,
  result text NOT NULL,
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  UNIQUE (hourly_check_id, parameter_definition_id)
);

CREATE TABLE quality.setup_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  item_id uuid REFERENCES catalog.items(id),
  route_option_id uuid REFERENCES manufacturing.route_options(id),
  operation_setup_id uuid REFERENCES manufacturing.operation_setups(id),
  code text NOT NULL,
  name text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (organization_id, code, revision)
);

CREATE TABLE quality.setup_checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  template_id uuid NOT NULL REFERENCES quality.setup_checklist_templates(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  prompt text NOT NULL,
  response_type text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (template_id, item_key)
);

CREATE TABLE quality.setup_checklist_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  template_id uuid NOT NULL REFERENCES quality.setup_checklist_templates(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  operation_setup_id uuid NOT NULL REFERENCES manufacturing.operation_setups(id),
  machine_id uuid REFERENCES catalog.machines(id),
  status text NOT NULL DEFAULT 'Open',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completed_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_completer text,
  reversed_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE TABLE quality.setup_checklist_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  session_id uuid NOT NULL REFERENCES quality.setup_checklist_sessions(id) ON DELETE CASCADE,
  template_item_id uuid NOT NULL REFERENCES quality.setup_checklist_template_items(id),
  response_text text,
  response_numeric numeric(20,8),
  response_boolean boolean,
  passed boolean,
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  UNIQUE (session_id, template_item_id)
);

CREATE TABLE maintenance.definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  frequency_unit text NOT NULL,
  frequency_value integer NOT NULL CHECK (frequency_value > 0),
  active boolean NOT NULL DEFAULT true,
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

CREATE UNIQUE INDEX maintenance_definitions_code_unique
  ON maintenance.definitions (organization_id, lower(code));

CREATE TABLE maintenance.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  definition_id uuid NOT NULL REFERENCES maintenance.definitions(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  prompt text NOT NULL,
  response_type text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (definition_id, item_key)
);

CREATE TABLE maintenance.machine_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  definition_id uuid NOT NULL REFERENCES maintenance.definitions(id),
  machine_id uuid NOT NULL REFERENCES catalog.machines(id),
  next_due_on date NOT NULL,
  last_completed_on date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (definition_id, machine_id)
);

CREATE INDEX machine_schedules_due_idx
  ON maintenance.machine_schedules (organization_id, next_due_on)
  WHERE active;

CREATE TABLE maintenance.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  machine_schedule_id uuid NOT NULL REFERENCES maintenance.machine_schedules(id),
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'Open',
  started_at timestamptz,
  completed_at timestamptz,
  assigned_to_employee_id uuid REFERENCES workforce.employees(id),
  completed_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_completer text,
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

CREATE TABLE maintenance.task_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  task_id uuid NOT NULL REFERENCES maintenance.tasks(id) ON DELETE CASCADE,
  checklist_item_id uuid NOT NULL REFERENCES maintenance.checklist_items(id),
  response_text text,
  response_numeric numeric(20,8),
  response_boolean boolean,
  passed boolean,
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (task_id, checklist_item_id)
);

CREATE TABLE audit.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES core.organizations(id),
  event_type text NOT NULL,
  target_schema text NOT NULL,
  target_table text NOT NULL,
  target_id uuid,
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  UNIQUE (source_system, source_table, source_id)
);

CREATE INDEX audit_events_target_idx
  ON audit.events (target_schema, target_table, target_id, occurred_at);

CREATE TABLE audit.record_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES core.organizations(id),
  target_schema text NOT NULL,
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  original_event_id uuid REFERENCES audit.events(id),
  reversed_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  legacy_actor text,
  reason text NOT NULL,
  reversed_at timestamptz NOT NULL DEFAULT now(),
  source_correction_system text NOT NULL,
  source_correction_id text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_correction_system, source_correction_id)
);

CREATE TABLE audit.legacy_convex_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES core.organizations(id),
  source_id text NOT NULL UNIQUE,
  target_source_table text,
  target_source_id text,
  target_schema text,
  target_table text,
  target_id uuid,
  correction_type text NOT NULL,
  reason text,
  legacy_actor text,
  original_timestamp timestamptz,
  resolved boolean NOT NULL DEFAULT false,
  source_payload jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit.legacy_pricing_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES core.organizations(id),
  source_id text NOT NULL UNIQUE,
  target_source_table text,
  target_source_id text,
  target_schema text,
  target_table text,
  target_id uuid,
  correction_type text NOT NULL,
  reason text,
  legacy_actor text,
  original_timestamp timestamptz,
  resolved boolean NOT NULL DEFAULT false,
  source_payload jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mrmpl_migration') THEN
    CREATE ROLE mrmpl_migration NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mrmpl_web') THEN
    CREATE ROLE mrmpl_web NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mrmpl_worker') THEN
    CREATE ROLE mrmpl_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mrmpl_reporting') THEN
    CREATE ROLE mrmpl_reporting NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$roles$;

REVOKE ALL ON SCHEMA
  identity,
  core,
  catalog,
  sales,
  manufacturing,
  workforce,
  quality,
  maintenance,
  audit,
  derived,
  migration
FROM PUBLIC;

REVOKE ALL ON ALL TABLES IN SCHEMA
  identity,
  core,
  catalog,
  sales,
  manufacturing,
  workforce,
  quality,
  maintenance,
  audit,
  derived,
  migration
FROM PUBLIC;

GRANT USAGE, CREATE ON SCHEMA
  identity,
  core,
  catalog,
  sales,
  manufacturing,
  workforce,
  quality,
  maintenance,
  audit,
  derived,
  migration
TO mrmpl_migration;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA
  identity,
  core,
  catalog,
  sales,
  manufacturing,
  workforce,
  quality,
  maintenance,
  audit,
  derived,
  migration
TO mrmpl_migration;

GRANT USAGE ON SCHEMA
  identity,
  core,
  catalog,
  sales,
  manufacturing,
  workforce,
  quality,
  maintenance,
  audit,
  derived
TO mrmpl_web;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA identity
  TO mrmpl_web;
GRANT SELECT, INSERT, UPDATE
  ON ALL TABLES IN SCHEMA core, catalog, sales, manufacturing, workforce, quality, maintenance
  TO mrmpl_web;
GRANT SELECT, INSERT
  ON ALL TABLES IN SCHEMA audit
  TO mrmpl_web;
GRANT SELECT, INSERT, UPDATE
  ON ALL TABLES IN SCHEMA derived
  TO mrmpl_web;

GRANT USAGE ON SCHEMA
  core,
  catalog,
  sales,
  manufacturing,
  workforce,
  quality,
  maintenance,
  audit,
  derived
TO mrmpl_worker;

GRANT SELECT
  ON ALL TABLES IN SCHEMA core, catalog, sales, manufacturing, workforce, quality, maintenance, audit
  TO mrmpl_worker;
GRANT SELECT, INSERT, UPDATE
  ON ALL TABLES IN SCHEMA derived
  TO mrmpl_worker;
GRANT USAGE ON SCHEMA identity TO mrmpl_worker;
GRANT SELECT ON identity.users TO mrmpl_worker;

GRANT USAGE ON SCHEMA
  core,
  catalog,
  sales,
  manufacturing,
  workforce,
  quality,
  maintenance,
  audit,
  derived
TO mrmpl_reporting;

GRANT SELECT
  ON ALL TABLES IN SCHEMA core, catalog, sales, manufacturing, workforce, quality, maintenance, audit, derived
  TO mrmpl_reporting;

ALTER DEFAULT PRIVILEGES IN SCHEMA identity
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mrmpl_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT SELECT, INSERT, UPDATE ON TABLES TO mrmpl_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog
  GRANT SELECT, INSERT, UPDATE ON TABLES TO mrmpl_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA sales
  GRANT SELECT, INSERT, UPDATE ON TABLES TO mrmpl_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA manufacturing
  GRANT SELECT, INSERT, UPDATE ON TABLES TO mrmpl_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA workforce
  GRANT SELECT, INSERT, UPDATE ON TABLES TO mrmpl_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA quality
  GRANT SELECT, INSERT, UPDATE ON TABLES TO mrmpl_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA maintenance
  GRANT SELECT, INSERT, UPDATE ON TABLES TO mrmpl_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit
  GRANT SELECT, INSERT ON TABLES TO mrmpl_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA derived
  GRANT SELECT, INSERT, UPDATE ON TABLES TO mrmpl_web;

ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT SELECT ON TABLES TO mrmpl_worker, mrmpl_reporting;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog
  GRANT SELECT ON TABLES TO mrmpl_worker, mrmpl_reporting;
ALTER DEFAULT PRIVILEGES IN SCHEMA sales
  GRANT SELECT ON TABLES TO mrmpl_worker, mrmpl_reporting;
ALTER DEFAULT PRIVILEGES IN SCHEMA manufacturing
  GRANT SELECT ON TABLES TO mrmpl_worker, mrmpl_reporting;
ALTER DEFAULT PRIVILEGES IN SCHEMA workforce
  GRANT SELECT ON TABLES TO mrmpl_worker, mrmpl_reporting;
ALTER DEFAULT PRIVILEGES IN SCHEMA quality
  GRANT SELECT ON TABLES TO mrmpl_worker, mrmpl_reporting;
ALTER DEFAULT PRIVILEGES IN SCHEMA maintenance
  GRANT SELECT ON TABLES TO mrmpl_worker, mrmpl_reporting;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit
  GRANT SELECT ON TABLES TO mrmpl_worker, mrmpl_reporting;
ALTER DEFAULT PRIVILEGES IN SCHEMA derived
  GRANT SELECT, INSERT, UPDATE ON TABLES TO mrmpl_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA derived
  GRANT SELECT ON TABLES TO mrmpl_reporting;
