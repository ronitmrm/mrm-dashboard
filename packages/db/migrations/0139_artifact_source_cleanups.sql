-- Durable handoff from a migrated private Artifact locator to legacy-source cleanup.
CREATE TABLE migration.artifact_source_cleanups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  physical_object_id uuid NOT NULL REFERENCES core.file_objects(id),
  source_provider text NOT NULL CHECK (source_provider = 'uploadthing'),
  source_provider_key text NOT NULL CHECK (length(source_provider_key) > 0),
  source_public_url text NOT NULL CHECK (length(source_public_url) > 0),
  expected_sha256 text NOT NULL
    CHECK (expected_sha256 ~ '^[a-f0-9]{64}$'),
  expected_byte_size bigint NOT NULL CHECK (expected_byte_size >= 0),
  destination_provider text NOT NULL
    CHECK (destination_provider = 'google-cloud-storage'),
  destination_provider_key text NOT NULL
    CHECK (length(destination_provider_key) > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'complete')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  last_attempted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (physical_object_id),
  CHECK (
    (status = 'complete' AND completed_at IS NOT NULL AND last_error IS NULL)
    OR (status = 'pending' AND completed_at IS NULL)
  )
);

CREATE INDEX artifact_source_cleanups_pending_idx
  ON migration.artifact_source_cleanups (created_at, id)
  WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE ON migration.artifact_source_cleanups TO mrmpl_web;
