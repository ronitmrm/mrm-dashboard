-- Artifact storage foundation.
CREATE TABLE core.file_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  provider text NOT NULL,
  provider_key text NOT NULL,
  public_url text NOT NULL,
  lifecycle_state text NOT NULL DEFAULT 'available'
    CHECK (lifecycle_state IN ('available', 'deletion_failed', 'deleted')),
  deletion_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sha256, byte_size),
  UNIQUE (provider, provider_key)
);

CREATE INDEX file_objects_organization_id_idx ON core.file_objects (organization_id);

ALTER TABLE core.files
  ADD COLUMN physical_object_id uuid REFERENCES core.file_objects(id),
  ADD COLUMN origin text NOT NULL DEFAULT 'legacy'
    CHECK (origin IN ('uploaded', 'generated', 'legacy')),
  ADD COLUMN lifecycle_state text NOT NULL DEFAULT 'current'
    CHECK (lifecycle_state IN ('current', 'superseded', 'deleted')),
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN deletion_reason text;

ALTER TABLE core.file_links
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN deactivated_at timestamptz;

WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY organization_id, target_schema, target_table, target_id, purpose
      ORDER BY created_at, id
    ) AS version,
    row_number() OVER (
      PARTITION BY organization_id, target_schema, target_table, target_id, purpose
      ORDER BY created_at DESC, id DESC
    ) = 1 AS is_current
  FROM core.file_links
)
UPDATE core.file_links link
SET version = ranked.version,
  is_current = ranked.is_current,
  deactivated_at = CASE WHEN ranked.is_current THEN NULL ELSE link.created_at END
FROM ranked
WHERE ranked.id = link.id;

UPDATE core.files file
SET lifecycle_state = 'superseded'
WHERE EXISTS (
  SELECT 1 FROM core.file_links link WHERE link.file_id = file.id AND NOT link.is_current
)
AND NOT EXISTS (
  SELECT 1 FROM core.file_links link WHERE link.file_id = file.id AND link.is_current
);

CREATE INDEX files_physical_object_id_idx ON core.files (physical_object_id);

CREATE UNIQUE INDEX file_links_current_target_idx
  ON core.file_links (organization_id, target_schema, target_table, target_id, purpose)
  WHERE is_current;
