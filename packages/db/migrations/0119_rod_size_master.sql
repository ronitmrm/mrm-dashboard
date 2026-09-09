-- Rod Size choices are organization-scoped; saved product/quote text is retained.
CREATE TABLE catalog.rod_sizes (
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
  source_payload jsonb
);
CREATE UNIQUE INDEX rod_sizes_organization_name_unique
  ON catalog.rod_sizes (organization_id, lower(name));
CREATE UNIQUE INDEX rod_sizes_source_unique
  ON catalog.rod_sizes (source_system, source_table, source_id);

GRANT SELECT, INSERT, UPDATE ON catalog.rod_sizes TO mrmpl_web;

INSERT INTO identity.permissions (key, module, name, description)
SELECT 'masters.universal.rodSize.' || action, 'masters',
  'Universal / Rod Size / ' || action,
  'Independent access to the company-wide Rod Size choices.'
FROM unnest(ARRAY['read', 'save', 'import', 'rename', 'delete']) AS action;

-- New master administration belongs to the existing system administrator.
-- Other roles can be assigned these independent rights in Access Administration.
INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM identity.roles roles CROSS JOIN identity.permissions permissions
WHERE roles.key = 'administrator' AND roles.is_system
  AND permissions.key LIKE 'masters.universal.rodSize.%';
