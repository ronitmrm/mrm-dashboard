BEGIN;
CREATE SCHEMA branding;
CREATE TABLE branding.counters (
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  type text NOT NULL CHECK (type IN ('sop', 'notice', 'policy')),
  value bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, type)
);
CREATE TABLE branding.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  type text NOT NULL CHECK (type IN ('sop', 'notice', 'policy')),
  number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, number)
);
CREATE TABLE branding.revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES branding.documents(id),
  revision integer NOT NULL CHECK (revision >= 0),
  content jsonb NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'issued')),
  version integer NOT NULL DEFAULT 1,
  author_user_id uuid NOT NULL REFERENCES identity.users(id),
  author_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  issued_at timestamptz,
  template_version text NOT NULL DEFAULT 'mrm-brand-v1',
  pdf bytea,
  UNIQUE (document_id, revision),
  CHECK ((state = 'draft' AND pdf IS NULL AND issued_at IS NULL) OR
    (state = 'issued' AND pdf IS NOT NULL AND issued_at IS NOT NULL)),
  CHECK (pdf IS NULL OR octet_length(pdf) <= 5242880)
);
CREATE UNIQUE INDEX branding_one_draft ON branding.revisions(document_id) WHERE state = 'draft';
CREATE INDEX branding_document_register ON branding.documents(organization_id, type, created_at DESC, id);
CREATE FUNCTION branding.protect_issued_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'issued' THEN RAISE EXCEPTION 'Issued revisions are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER branding_immutable_issue BEFORE UPDATE OR DELETE ON branding.revisions
  FOR EACH ROW EXECUTE FUNCTION branding.protect_issued_revision();
INSERT INTO identity.permissions (key, module, name, description)
SELECT 'branding.' || kind || '.' || action, 'branding', label || ' ' || action,
  CASE action WHEN 'read' THEN 'View documents, revision history and PDFs.' ELSE 'Save, assist, revise and issue documents without approval.' END
FROM (VALUES ('sop', 'SOPs'), ('notice', 'Notices'), ('policy', 'Policies')) AS types(kind, label)
CROSS JOIN (VALUES ('read'), ('write')) AS actions(action);
INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id FROM identity.roles role
CROSS JOIN identity.permissions permission
WHERE role.key = 'administrator' AND permission.key LIKE 'branding.%'
ON CONFLICT DO NOTHING;
GRANT USAGE ON SCHEMA branding TO mrmpl_web, mrmpl_reporting;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA branding TO mrmpl_web;
GRANT SELECT ON ALL TABLES IN SCHEMA branding TO mrmpl_reporting;
COMMIT;
