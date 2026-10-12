ALTER TABLE branding.documents
  ADD COLUMN iso_module text,
  ADD COLUMN workflow_title text NOT NULL DEFAULT '',
  ADD COLUMN workflow_department text NOT NULL DEFAULT '',
  ADD COLUMN workflow_text text NOT NULL DEFAULT '',
  ADD COLUMN workflow_version integer NOT NULL DEFAULT 1,
  ADD COLUMN responsible_user_id uuid REFERENCES identity.users(id),
  ADD COLUMN work_target_on date;
CREATE UNIQUE INDEX document_iso_module ON branding.documents(organization_id,iso_module) WHERE iso_module IS NOT NULL;
ALTER TABLE document_control.management_reviews ADD COLUMN work_department text NOT NULL DEFAULT '', ADD COLUMN owner_user_id uuid REFERENCES identity.users(id), ADD COLUMN work_target_on date;
ALTER TABLE document_control.interested_party_requirements ADD COLUMN work_target_on date;
ALTER TABLE document_control.sipoc_maps ADD COLUMN work_target_on date;
ALTER TABLE document_control.customer_satisfaction_reports ADD COLUMN work_department text NOT NULL DEFAULT '', ADD COLUMN work_target_on date;

CREATE TABLE document_control.workflow_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id),
  document_id uuid NOT NULL REFERENCES branding.documents(id),
  source_key text, source_href text NOT NULL DEFAULT '',
  title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 4000), expected_result text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '', owner_user_id uuid REFERENCES identity.users(id), due_on date,
  status text NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','In Progress','Completed','Closed')),
  work_done text NOT NULL DEFAULT '', evidence text NOT NULL DEFAULT '', qa_findings text NOT NULL DEFAULT '',
  completed_by_user_id uuid REFERENCES identity.users(id), completed_at timestamptz,
  verified_by_user_id uuid REFERENCES identity.users(id), verified_at timestamptz,
  workflow_snapshot text NOT NULL, workflow_version integer NOT NULL,
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,source_key),
  CHECK(status <> 'Closed' OR (completed_at IS NOT NULL AND completed_by_user_id IS NOT NULL AND verified_by_user_id IS NOT NULL AND verified_at IS NOT NULL AND length(trim(qa_findings))>0 AND length(trim(evidence))>0))
);
CREATE INDEX workflow_actions_pending ON document_control.workflow_actions(organization_id,status,due_on);
GRANT SELECT,INSERT,UPDATE ON document_control.workflow_actions TO mrmpl_web;
GRANT SELECT ON document_control.workflow_actions TO mrmpl_reporting;

INSERT INTO identity.permissions(key,module,name,description) VALUES
 ('iso.tasks.read','iso-document','View assigned ISO pending actions','View work assigned to your account and its linked workflow.'),
 ('iso.tasks.department','iso-document','HOD manage department ISO assignments','View work, assign staff and change target dates only in your active departments.'),
 ('iso.tasks.manage','iso-document','QA manage ISO workflows','Manage master workflow text, ownership and linked actions.'),
 ('iso.tasks.verify','iso-document','QA verify ISO action closure','Verify completion evidence and effectiveness, return or reopen work.');
INSERT INTO identity.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM identity.roles r CROSS JOIN identity.permissions p
 WHERE p.key='iso.tasks.read'
 OR (r.key IN ('administrator','quality-assurance-hod') AND p.key LIKE 'iso.tasks.%')
 OR (r.key='department-manager' AND p.key='iso.tasks.department') ON CONFLICT DO NOTHING;

-- QA-owned workflow entries; no fabricated staff assignments or issued formats.
WITH modules(key,title,department,task,href) AS (VALUES
 ('pest','PEST Analysis','Quality Assurance','assess the external issue, expected impact and action; implement the agreed plan.','/iso-document/analysis/pest'),
 ('swot','SWOT Analysis','Quality Assurance','assess the insight, expected outcome and action; implement the agreed plan.','/iso-document/analysis/swot'),
 ('risk','Risk-Based Thinking','Quality Assurance','assess the risk and controls; implement treatment and provide effectiveness evidence. QA records residual risk and acceptance.','/iso-document/analysis/risk'),
 ('management-review','Management Review Meetings','Quality Assurance','prepare review inputs, confirm top management participation, record decisions and track each follow-up point.','/iso-document/management-review'),
 ('interested-parties','Interested Parties Requirements','Quality Assurance','confirm relevant requirements, monitoring criteria and observations; record gaps and follow-up work.','/iso-document/interested-parties'),
 ('sipoc','SIPOC Process Maps','Quality Assurance','define process boundaries, suppliers, inputs, steps, outputs, customers and checks with the process owner.','/iso-document/sipoc'),
 ('customer-satisfaction','Customer Satisfaction Reports','Quality Assurance','collect customer feedback, retain the original report, analyse results and link required follow-up actions.','/iso-document/customer-satisfaction'),
 ('measuring-instruments','Measuring Instrument Register','Quality Control','maintain instrument identification, location, condition and calibration evidence in Store.','/iso-document/measuring-instruments'),
 ('maintenance','Maintenance','Asset Management','perform planned maintenance in the operational register; record checks, work done and results.','/iso-document/machine-maintenance-plan'),
 ('calibration','Calibration Plan','Quality Control','arrange calibration, record the actual technical result and certificate, and address failures in Store.','/iso-document/calibration-plan'),
 ('rejections','Rejection Register','Quality Control','record the rejection, contain affected material and assign an evidence-based corrective follow-up when required.','/iso-document/rejections')
), inserted AS (
 INSERT INTO branding.documents(organization_id,type,document_type,iso_module,workflow_title,workflow_department,responsible_role,workflow_text,record_locations,content_access)
 SELECT o.id,'controlled-document','register-list',m.key,m.title,m.department,'Document owner',
 '1. Department HOD: assign the responsible person and target date.'||E'\n'||
 '2. Responsible person: '||m.task||E'\n'||
 '3. Responsible person: record the result and supporting evidence; submit for QA.'||E'\n'||
 '4. QA: verify the evidence and expected result; close or return with remarks.'||E'\n'||
 '5. Document owner: arrange the next review when required.',
 jsonb_build_array(jsonb_build_object('kind','mrm','label',m.title,'href',m.href)),'all-signed-in'
 FROM core.organizations o CROSS JOIN modules m WHERE o.code='MRMPL'
 RETURNING *
) INSERT INTO audit.events(organization_id,event_type,target_schema,target_table,target_id,reason,after_state,metadata,source_system,source_table,source_id)
 SELECT organization_id,'document.workflow.created','branding','documents',id,
 'Initial workflow text for QA review; responsible account and released format remain unconfirmed.',
 jsonb_build_object('title',workflow_title,'department',workflow_department,'text',workflow_text,'version',workflow_version),
 '{}','document-migration','iso-workflow-setup',iso_module FROM inserted;
