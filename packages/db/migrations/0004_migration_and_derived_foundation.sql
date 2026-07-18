CREATE TABLE core.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Calcutta',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX organizations_code_normalized_unique
  ON core.organizations (lower(code));

CREATE TABLE core.number_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  key text NOT NULL,
  current_value bigint NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  source_system text,
  source_table text,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

CREATE TABLE core.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  file_name text NOT NULL,
  media_type text,
  byte_size bigint CHECK (byte_size IS NULL OR byte_size >= 0),
  sha256 text,
  storage_key text,
  legacy_path text,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, source_table, source_id)
);

CREATE INDEX files_organization_id_idx ON core.files (organization_id);
CREATE INDEX files_sha256_idx ON core.files (sha256);

CREATE TABLE core.file_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  file_id uuid NOT NULL REFERENCES core.files(id) ON DELETE CASCADE,
  target_schema text NOT NULL,
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  purpose text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, target_schema, target_table, target_id, purpose)
);

CREATE INDEX file_links_target_idx
  ON core.file_links (target_schema, target_table, target_id);

CREATE TABLE migration.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  git_commit text NOT NULL,
  operator text NOT NULL,
  target_migration_version text NOT NULL,
  status text NOT NULL DEFAULT 'inventory'
    CHECK (status IN ('inventory', 'staging', 'transforming', 'reconciling', 'complete', 'failed'))
);

CREATE TABLE migration.artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('convex', 'sqlite', 'hr')),
  artifact_path text NOT NULL,
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  table_inventory jsonb NOT NULL,
  extract_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (migration_run_id, source_kind, sha256)
);

CREATE INDEX artifacts_migration_run_id_idx
  ON migration.artifacts (migration_run_id);

CREATE TABLE migration.convex_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES migration.artifacts(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_creation_time numeric(20,6),
  document jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, source_table, source_id)
);

CREATE INDEX convex_documents_run_table_idx
  ON migration.convex_documents (migration_run_id, source_table);

CREATE TABLE migration.source_id_map (
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  target_schema text NOT NULL,
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE RESTRICT,
  transformation_version text NOT NULL,
  mapped_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_system, source_table, source_id)
);

CREATE INDEX source_id_map_target_idx
  ON migration.source_id_map (target_schema, target_table, target_id);
CREATE INDEX source_id_map_run_id_idx
  ON migration.source_id_map (migration_run_id);

CREATE TABLE migration.identity_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'rejected')),
  proposed_resolution jsonb,
  approved_resolution jsonb,
  approved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE migration.relationship_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'rejected')),
  proposed_resolution jsonb,
  approved_resolution jsonb,
  approved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE migration.type_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'rejected')),
  proposed_resolution jsonb,
  approved_resolution jsonb,
  approved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE migration.unknown_entry_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  row_count bigint NOT NULL CHECK (row_count > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'rejected')),
  proposed_resolution jsonb,
  approved_resolution jsonb,
  approved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (migration_run_id, entry_type)
);

CREATE TABLE migration.orphan_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'rejected')),
  proposed_resolution jsonb,
  approved_resolution jsonb,
  approved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE migration.file_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'rejected')),
  proposed_resolution jsonb,
  approved_resolution jsonb,
  approved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX identity_conflicts_status_idx
  ON migration.identity_conflicts (migration_run_id, status);
CREATE INDEX relationship_conflicts_status_idx
  ON migration.relationship_conflicts (migration_run_id, status);
CREATE INDEX type_conflicts_status_idx
  ON migration.type_conflicts (migration_run_id, status);
CREATE INDEX unknown_entry_types_status_idx
  ON migration.unknown_entry_types (migration_run_id, status);
CREATE INDEX orphan_corrections_status_idx
  ON migration.orphan_corrections (migration_run_id, status);
CREATE INDEX file_conflicts_status_idx
  ON migration.file_conflicts (migration_run_id, status);

CREATE TABLE migration.validation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  check_key text NOT NULL,
  scope text NOT NULL,
  status text NOT NULL CHECK (status IN ('pass', 'warning', 'fail', 'approved_exception')),
  expected_value jsonb,
  actual_value jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (migration_run_id, check_key, scope)
);

CREATE TABLE migration.source_hashes (
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE CASCADE,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_hash text NOT NULL CHECK (length(source_hash) = 64),
  target_hash text CHECK (target_hash IS NULL OR length(target_hash) = 64),
  transformation_version text NOT NULL,
  exception_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (migration_run_id, source_system, source_table, source_id)
);

CREATE TABLE derived.dashboard_read_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  version bigint NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  source_watermark jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, version)
);

CREATE INDEX dashboard_read_models_latest_idx
  ON derived.dashboard_read_models (organization_id, version DESC);

CREATE TABLE derived.refresh_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  queue_key text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  run_after timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refresh_jobs_claim_idx
  ON derived.refresh_jobs (status, run_after, queue_key);

CREATE TABLE derived.refresh_watermarks (
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  key text NOT NULL,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  source_watermark jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, key)
);

CREATE TABLE derived.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES core.organizations(id),
  topic text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text
);

CREATE INDEX outbox_events_claim_idx
  ON derived.outbox_events (available_at, occurred_at)
  WHERE published_at IS NULL;

