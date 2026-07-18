CREATE TABLE migration.sqlite_counters (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  name text NOT NULL,
  value bigint NOT NULL,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_customers (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  customer_uid text NOT NULL,
  company_name text NOT NULL,
  status text NOT NULL,
  contact_name text,
  email text,
  phone text,
  country text,
  notes text,
  created_at text NOT NULL,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_design_categories (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  name text NOT NULL,
  created_at text NOT NULL,
  code text,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_design_processes (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  name text NOT NULL,
  created_at text NOT NULL,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_design_subcategories (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  category_id bigint NOT NULL,
  name text NOT NULL,
  created_at text NOT NULL,
  combination_code text,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_enquiry_import_reviews (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  enquiry_id bigint NOT NULL,
  status text NOT NULL,
  created_at text NOT NULL,
  applied_at text,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_enquiry_import_review_rows (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  review_id bigint NOT NULL,
  row_no bigint NOT NULL,
  part text,
  description text,
  grade text,
  quantity numeric,
  target_price numeric,
  drawing_reference text,
  remarks text,
  classification text NOT NULL,
  suggested_action text NOT NULL,
  matched_quote_item_id bigint,
  matched_product_id bigint,
  match_note text,
  created_enquiry_item_id bigint,
  applied_action text,
  matched_enquiry_item_id bigint,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_product_grades (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  name text NOT NULL,
  created_at text NOT NULL,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_product_machine_types (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  name text NOT NULL,
  created_at text NOT NULL,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_product_rod_types (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  name text NOT NULL,
  created_at text NOT NULL,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_quote_commercial_terms (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  term_type text NOT NULL,
  name text NOT NULL,
  created_at text NOT NULL,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_quote_material_rates (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  grade text NOT NULL,
  rod_type text NOT NULL,
  alloy_premium numeric NOT NULL,
  ext_cost numeric NOT NULL,
  created_at text NOT NULL,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_quote_packaging_options (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  name text NOT NULL,
  packing_cost numeric NOT NULL,
  cost_basis text NOT NULL,
  created_at text NOT NULL,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_quote_shipping_terms (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  name text NOT NULL,
  shipping_cost numeric NOT NULL,
  created_at text NOT NULL,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_website_applications (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  name text NOT NULL,
  sort_order bigint NOT NULL,
  created_at text NOT NULL,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_website_certifications (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  name text NOT NULL,
  sort_order bigint NOT NULL,
  created_at text NOT NULL,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE TABLE migration.sqlite_website_field_options (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  id bigint NOT NULL,
  field_type text NOT NULL,
  name text NOT NULL,
  sort_order bigint NOT NULL,
  created_at text NOT NULL,
  source_row jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, source_id)
);

CREATE INDEX sqlite_counters_run_idx
  ON migration.sqlite_counters (migration_run_id);
CREATE INDEX sqlite_customers_run_idx
  ON migration.sqlite_customers (migration_run_id);
CREATE INDEX sqlite_design_categories_run_idx
  ON migration.sqlite_design_categories (migration_run_id);
CREATE INDEX sqlite_design_processes_run_idx
  ON migration.sqlite_design_processes (migration_run_id);
CREATE INDEX sqlite_design_subcategories_run_idx
  ON migration.sqlite_design_subcategories (migration_run_id);
CREATE INDEX sqlite_enquiry_import_review_rows_run_idx
  ON migration.sqlite_enquiry_import_review_rows (migration_run_id);
CREATE INDEX sqlite_enquiry_import_reviews_run_idx
  ON migration.sqlite_enquiry_import_reviews (migration_run_id);
CREATE INDEX sqlite_product_grades_run_idx
  ON migration.sqlite_product_grades (migration_run_id);
CREATE INDEX sqlite_product_machine_types_run_idx
  ON migration.sqlite_product_machine_types (migration_run_id);
CREATE INDEX sqlite_product_rod_types_run_idx
  ON migration.sqlite_product_rod_types (migration_run_id);
CREATE INDEX sqlite_quote_commercial_terms_run_idx
  ON migration.sqlite_quote_commercial_terms (migration_run_id);
CREATE INDEX sqlite_quote_material_rates_run_idx
  ON migration.sqlite_quote_material_rates (migration_run_id);
CREATE INDEX sqlite_quote_packaging_options_run_idx
  ON migration.sqlite_quote_packaging_options (migration_run_id);
CREATE INDEX sqlite_quote_shipping_terms_run_idx
  ON migration.sqlite_quote_shipping_terms (migration_run_id);
CREATE INDEX sqlite_website_applications_run_idx
  ON migration.sqlite_website_applications (migration_run_id);
CREATE INDEX sqlite_website_certifications_run_idx
  ON migration.sqlite_website_certifications (migration_run_id);
CREATE INDEX sqlite_website_field_options_run_idx
  ON migration.sqlite_website_field_options (migration_run_id);
