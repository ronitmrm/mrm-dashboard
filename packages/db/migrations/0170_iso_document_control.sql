BEGIN;

CREATE SCHEMA document_control;

CREATE TABLE document_control.counters (
  organization_id uuid PRIMARY KEY REFERENCES core.organizations(id),
  value bigint NOT NULL DEFAULT 0 CHECK (value >= 0)
);

INSERT INTO document_control.counters (organization_id, value)
SELECT organization_id, max(substring(number FROM 8 FOR 3)::bigint)
FROM branding.documents
WHERE number ~ '^MRM-QA-[0-9]{3}(-[0-9]{2})?$'
GROUP BY organization_id;

ALTER TABLE branding.documents
  ADD COLUMN document_type text,
  ADD COLUMN responsible_role text,
  ADD COLUMN use_status text NOT NULL DEFAULT 'in-use',
  ADD COLUMN review_cycle_months integer,
  ADD COLUMN data_frequency_type text NOT NULL DEFAULT 'not-applicable',
  ADD COLUMN data_frequency_interval_days integer,
  ADD COLUMN data_frequency_detail text,
  ADD COLUMN data_retention text,
  ADD COLUMN record_locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN content_access text NOT NULL DEFAULT 'restricted',
  ADD COLUMN metadata_version integer NOT NULL DEFAULT 1;

UPDATE branding.documents
SET document_type = CASE type
  WHEN 'sop' THEN 'sop-procedure'
  WHEN 'policy' THEN 'policy-manual'
  WHEN 'work-instruction' THEN 'work-instruction'
  ELSE 'other-controlled-document'
END;

-- Preserve the pre-existing signed-in register access for already-created
-- documents. Newly created documents retain the safer restricted default.
UPDATE branding.documents SET content_access = 'all-signed-in';

ALTER TABLE branding.documents
  ALTER COLUMN document_type SET NOT NULL,
  ALTER COLUMN document_type SET DEFAULT 'other-controlled-document',
  ADD CONSTRAINT branding_document_type_check CHECK (document_type IN (
    'sop-procedure', 'policy-manual', 'work-instruction', 'form-format',
    'plan', 'register-list', 'checklist', 'technical-document',
    'external-document', 'other-controlled-document'
  )),
  ADD CONSTRAINT branding_document_use_status_check
    CHECK (use_status IN ('in-use', 'not-in-use')),
  ADD CONSTRAINT branding_document_review_cycle_check
    CHECK (review_cycle_months IS NULL OR review_cycle_months > 0),
  ADD CONSTRAINT branding_document_frequency_type_check CHECK (
    data_frequency_type IN (
      'event-based', 'scheduled-interval', 'as-required', 'not-applicable'
    )
  ),
  ADD CONSTRAINT branding_document_frequency_interval_check CHECK (
    data_frequency_interval_days IS NULL OR data_frequency_interval_days > 0
  ),
  ADD CONSTRAINT branding_document_record_locations_check
    CHECK (jsonb_typeof(record_locations) = 'array'),
  ADD CONSTRAINT branding_document_content_access_check
    CHECK (content_access IN ('all-signed-in', 'restricted')),
  ADD CONSTRAINT branding_document_metadata_version_check
    CHECK (metadata_version > 0);

ALTER TABLE branding.revisions
  ADD COLUMN workflow_state text,
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN submitted_by_user_id uuid REFERENCES identity.users(id),
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approved_by_user_id uuid REFERENCES identity.users(id),
  ADD COLUMN approval_remarks text,
  ADD COLUMN released_by_user_id uuid REFERENCES identity.users(id);

UPDATE branding.revisions
SET workflow_state = CASE state WHEN 'issued' THEN 'released' ELSE 'draft' END,
    released_by_user_id = CASE WHEN state = 'issued' THEN author_user_id END;

ALTER TABLE branding.revisions
  ALTER COLUMN workflow_state SET NOT NULL,
  ALTER COLUMN workflow_state SET DEFAULT 'draft',
  ADD CONSTRAINT branding_revision_workflow_state_check CHECK (
    workflow_state IN (
      'draft', 'pending-approval', 'approved', 'released'
    )
  ),
  ADD CONSTRAINT branding_revision_workflow_release_check CHECK (
    (state = 'issued' AND workflow_state = 'released')
    OR (state = 'draft' AND workflow_state <> 'released')
  );

CREATE INDEX branding_master_document_register
  ON branding.documents (organization_id, use_status, document_type, created_at);
CREATE INDEX branding_revision_workflow_queue
  ON branding.revisions (workflow_state, updated_at DESC)
  WHERE state = 'draft';

CREATE TABLE document_control.monitoring_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  document_id uuid NOT NULL REFERENCES branding.documents(id),
  obligation_type text NOT NULL CHECK (
    obligation_type IN ('document-review', 'data-record')
  ),
  period_label text NOT NULL,
  evidence_location text,
  remarks text,
  completed_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  completed_by_name text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, obligation_type, period_label)
);

INSERT INTO identity.permissions (key, module, name, description) VALUES
  ('iso.documents.manage', 'iso-document', 'Manage ISO documents',
   'Create drafts, revisions and document-control metadata and submit for approval.'),
  ('iso.documents.approve', 'iso-document', 'Approve ISO documents',
   'Approve or reject documents for an assigned department.'),
  ('iso.documents.release', 'iso-document', 'Release ISO documents',
   'Perform Quality Assurance final release.'),
  ('iso.documents.monitor', 'iso-document', 'Confirm ISO obligations',
   'Record document-review and operational-record confirmations.');

INSERT INTO identity.roles (key, name, description, is_system) VALUES
  ('quality-assurance-hod', 'Quality Assurance HOD',
   'Creates, controls and finally releases ISO documents.', false),
  ('department-manager', 'Department Manager',
   'Approves or rejects ISO documents for assigned departments.', false)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system = false,
  updated_at = now();

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
CROSS JOIN identity.permissions permission
WHERE role.key = 'administrator'
  AND permission.key LIKE 'iso.documents.%'
ON CONFLICT DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
CROSS JOIN identity.permissions permission
WHERE role.key = 'quality-assurance-hod'
  AND (
    permission.key IN (
      'iso.documents.manage', 'iso.documents.release', 'iso.documents.monitor'
    )
    OR permission.key LIKE 'branding.%.read'
    OR permission.key LIKE 'branding.%.write'
  )
ON CONFLICT DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
CROSS JOIN identity.permissions permission
WHERE role.key = 'department-manager'
  AND permission.key = 'iso.documents.approve'
ON CONFLICT DO NOTHING;

GRANT USAGE ON SCHEMA document_control TO mrmpl_web, mrmpl_reporting;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA document_control TO mrmpl_web;
GRANT SELECT ON ALL TABLES IN SCHEMA document_control TO mrmpl_reporting;

COMMIT;
