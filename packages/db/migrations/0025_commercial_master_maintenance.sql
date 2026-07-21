CREATE TABLE sales.quote_term_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  term_key text NOT NULL CHECK (length(btrim(term_key)) > 0),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  value text NOT NULL CHECK (length(btrim(value)) > 0),
  sort_order integer NOT NULL DEFAULT 100 CHECK (sort_order >= 0),
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

CREATE UNIQUE INDEX quote_term_templates_key_unique
  ON sales.quote_term_templates (organization_id, lower(term_key));

CREATE UNIQUE INDEX commercial_terms_source_scope_unique
  ON sales.commercial_terms (organization_id, term_type, lower(name));

DROP INDEX sales.material_rates_legacy_scope_unique;

CREATE UNIQUE INDEX material_rates_source_scope_unique
  ON sales.material_rates (
    organization_id,
    material_grade_id,
    rod_type_id
  ) NULLS NOT DISTINCT;

