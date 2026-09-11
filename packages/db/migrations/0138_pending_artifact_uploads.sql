CREATE TABLE core.pending_artifact_uploads (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  owner_user_id uuid NOT NULL REFERENCES identity.users(id),
  intent jsonb NOT NULL CHECK (jsonb_typeof(intent) = 'object'),
  expected_byte_size bigint NOT NULL CHECK (expected_byte_size > 0),
  original_file_name text NOT NULL CHECK (length(original_file_name) BETWEEN 1 AND 255),
  media_type text NOT NULL CHECK (length(media_type) <= 255),
  provider text NOT NULL DEFAULT 'google-cloud-storage'
    CHECK (provider = 'google-cloud-storage'),
  provider_key text NOT NULL,
  resumable_session text,
  confirmed_offset bigint NOT NULL DEFAULT 0
    CHECK (confirmed_offset >= 0 AND confirmed_offset <= expected_byte_size),
  status text NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'uploaded', 'ready', 'rejected', 'abandoned', 'finalized')),
  expires_at timestamptz NOT NULL,
  completed_byte_size bigint,
  completed_sha256 text CHECK (completed_sha256 IS NULL OR length(completed_sha256) = 64),
  temporary_generation text,
  final_target_schema text,
  final_target_table text,
  final_target_id uuid,
  final_purpose text,
  final_artifact_id uuid REFERENCES core.files(id),
  cleanup_error text,
  cleanup_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_key),
  CHECK (
    (status IN ('ready', 'finalized')
      AND completed_byte_size = expected_byte_size
      AND completed_sha256 IS NOT NULL
      AND temporary_generation IS NOT NULL)
    OR status NOT IN ('ready', 'finalized')
  ),
  CHECK (
    status <> 'finalized'
    OR (final_target_schema IS NOT NULL AND final_target_table IS NOT NULL
      AND final_target_id IS NOT NULL AND final_purpose IS NOT NULL
      AND final_artifact_id IS NOT NULL)
  )
);

CREATE INDEX pending_artifact_uploads_owner_idx
  ON core.pending_artifact_uploads (owner_user_id, created_at DESC);

CREATE INDEX pending_artifact_uploads_cleanup_idx
  ON core.pending_artifact_uploads (status, expires_at)
  WHERE cleanup_completed_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON core.pending_artifact_uploads TO mrmpl_web;
