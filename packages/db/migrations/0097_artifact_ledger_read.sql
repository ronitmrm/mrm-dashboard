-- Artifact ledger read access.
INSERT INTO identity.permissions (key, module, name, description)
VALUES (
  'artifacts.read',
  'artifacts',
  'View Artifact ledger',
  'Open the Administration Artifacts ledger and inspect Organization-scoped Artifact metadata.'
)
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM identity.roles AS roles
JOIN identity.permissions AS permissions ON permissions.key = 'artifacts.read'
WHERE roles.key = 'administrator'
ON CONFLICT (role_id, permission_id) DO NOTHING;

CREATE INDEX file_links_file_id_ledger_idx
  ON core.file_links (file_id, created_at, id);

CREATE INDEX files_artifact_ledger_idx
  ON core.files (organization_id, created_at DESC, id DESC)
  WHERE source_system = 'artifact-service';
