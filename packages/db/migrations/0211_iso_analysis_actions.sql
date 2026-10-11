CREATE TABLE document_control.analysis_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  record_number integer GENERATED ALWAYS AS IDENTITY UNIQUE,
  kind text NOT NULL CHECK (kind IN ('PEST', 'SWOT')),
  analysis_year integer NOT NULL CHECK (analysis_year BETWEEN 2000 AND 2100),
  category text NOT NULL,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 4000),
  action_plan text NOT NULL CHECK (length(trim(action_plan)) BETWEEN 1 AND 4000),
  department text NOT NULL DEFAULT '',
  owner_user_id uuid REFERENCES identity.users(id),
  identified_on date,
  due_on date,
  reviewed_on date,
  next_review_on date,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Completed', 'Closed')),
  completion_notes text NOT NULL DEFAULT '',
  evidence_location text NOT NULL DEFAULT '',
  completed_at timestamptz,
  completed_by_user_id uuid REFERENCES identity.users(id),
  closed_at timestamptz,
  closed_by_user_id uuid REFERENCES identity.users(id),
  closure_remarks text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  source_key text,
  source_payload jsonb,
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'PEST' AND category IN ('Political', 'Economic', 'Social', 'Technological'))
    OR (kind = 'SWOT' AND category IN ('Strength', 'Weakness', 'Opportunity', 'Threat'))),
  CHECK (status <> 'Closed' OR (closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL AND length(trim(closure_remarks)) > 0)),
  UNIQUE (organization_id, kind, source_key)
);
CREATE INDEX analysis_records_register ON document_control.analysis_records (organization_id, kind, analysis_year, status);
CREATE INDEX analysis_records_owner ON document_control.analysis_records (owner_user_id) WHERE owner_user_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON document_control.analysis_records TO mrmpl_web;
GRANT USAGE, SELECT ON SEQUENCE document_control.analysis_records_record_number_seq TO mrmpl_web;
GRANT SELECT ON document_control.analysis_records TO mrmpl_reporting;

INSERT INTO identity.permissions (key, module, name, description) VALUES
  ('iso.analysis.read', 'iso-document', 'View all PEST and SWOT analyses', 'View and export all analysis records and history; assigned staff can access their own items.'),
  ('iso.analysis.manage', 'iso-document', 'Manage PEST and SWOT analyses', 'Create, import and edit analysis items, action plans, assignments and deadlines.'),
  ('iso.analysis.verify', 'iso-document', 'Verify and close PEST and SWOT actions', 'QA verifies completion, returns work, reopens closed actions and records reviews.');

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id FROM identity.roles role CROSS JOIN identity.permissions permission
WHERE (role.key IN ('administrator', 'quality-assurance-hod') AND permission.key LIKE 'iso.analysis.%')
  OR (role.key = 'department-manager' AND permission.key = 'iso.analysis.read')
ON CONFLICT DO NOTHING;

-- Supplied 2026 PEST/SWOT source rows; source completion remains awaiting QA verification.
WITH source_rows(kind, analysis_year, category, description, action_plan, department,
  identified_on, due_on, reviewed_on, next_review_on, status, completion_notes, source_key, source_payload) AS (
  VALUES
('SWOT', '2026', 'Weakness', 'Thread Gauge Calibration Failures In 1 year', 'Give Clear Instructions On Gauge Handling & Use', '', NULL, NULL, '2026-01-15', '2026-02-15', 'Completed', 'QA Manager Conducted', '2026:2026:6', '{"fileName":"swot 2026.xlsx","sha256":"3c751215e18b74d6ede7e82ad7b0cfde5c4da1bdbdd9a28e8a68ce9654ebab89","sheet":"2026","row":6,"documentNumber":"MRM-QA-022-01","columns":{"Sr No.":"1","Description / Insight":"Thread Gauge Calibration Failures In 1 year","Analysis":"Weaknesses","Action Plan":"Give Clear Instructions On Gauge Handling & Use","Action taken":"QA Manager Conducted","Status":"Complet","Review date":"2026-01-15"}}'),
('SWOT', '2026', 'Weakness', 'Customer NPD sample rejected due to instrument error', 'Same measuring instrument purchase + calibration', '', NULL, NULL, '2026-02-12', '2026-03-12', 'Completed', 'Top Management', '2026:2026:7', '{"fileName":"swot 2026.xlsx","sha256":"3c751215e18b74d6ede7e82ad7b0cfde5c4da1bdbdd9a28e8a68ce9654ebab89","sheet":"2026","row":7,"documentNumber":"MRM-QA-022-01","columns":{"Sr No.":"2","Description / Insight":"Customer NPD sample rejected due to instrument error","Analysis":"Weaknesses","Action Plan":"Same measuring instrument purchase + calibration","Action taken":"Top Management","Status":"Complet","Review date":"2026-02-12"}}'),
('SWOT', '2026', 'Opportunity', 'Increasing use of digital quality management systems', 'Implement digital monitoring and quality software', '', NULL, NULL, '2026-05-01', '2026-06-01', 'Completed', 'Top Management', '2026:2026:8', '{"fileName":"swot 2026.xlsx","sha256":"3c751215e18b74d6ede7e82ad7b0cfde5c4da1bdbdd9a28e8a68ce9654ebab89","sheet":"2026","row":8,"documentNumber":"MRM-QA-022-01","columns":{"Sr No.":"3","Description / Insight":"Increasing use of digital quality management systems","Analysis":"Opportunity","Action Plan":"Implement digital monitoring and quality software","Action taken":"Top Management","Status":"Complet","Review date":"2026-05-01"}}'),
('SWOT', '2026', 'Threat', 'Difficulty retaining skilled manpower', 'Improve employee retention and career growth programs', '', NULL, NULL, '2026-07-01', '2026-08-01', 'Completed', 'HR planning under process', '2026:2026:9', '{"fileName":"swot 2026.xlsx","sha256":"3c751215e18b74d6ede7e82ad7b0cfde5c4da1bdbdd9a28e8a68ce9654ebab89","sheet":"2026","row":9,"documentNumber":"MRM-QA-022-01","columns":{"Sr No.":"4","Description / Insight":"Difficulty retaining skilled manpower","Analysis":"Threat ","Action Plan":"Improve employee retention and career growth programs","Action taken":"HR planning under process","Status":"Complet","Review date":"2026-07-01"}}'),
('SWOT', '2026', 'Weakness', 'Lack of proper canteen facility may affect employee satisfaction', 'Develop better canteen facility with hygiene control and quality food supply', '', NULL, NULL, '2026-07-01', '2026-08-01', 'Completed', 'Action plan initiated', '2026:2026:10', '{"fileName":"swot 2026.xlsx","sha256":"3c751215e18b74d6ede7e82ad7b0cfde5c4da1bdbdd9a28e8a68ce9654ebab89","sheet":"2026","row":10,"documentNumber":"MRM-QA-022-01","columns":{"Sr No.":"5","Description / Insight":"Lack of proper canteen facility may affect employee satisfaction","Analysis":"Weakness","Action Plan":"Develop better canteen facility with hygiene control and quality food supply","Action taken":"Action plan initiated","Status":"Complet","Review date":"2026-07-01"}}'),
('PEST', '2026', 'Social', 'Youth prefer city jobs', 'Offer skill‑based growth opportunities (machine operator, QC assistant)', 'HR + Production', '2026-01-10', '2026-03-11', NULL, NULL, 'Completed', '', '2026:2026:4', '{"fileName":"pest 2026.xlsx","sha256":"6c57e15261e47f79b0024a7b03b6e3cf781f9ab6f3006f4c9f4f6fe621c68a6d","sheet":"2026","row":4,"documentNumber":"MRM-QA-021-01","columns":{"Date":"2026-01-10","Issue Identified":"Youth prefer city jobs","Factor":"Social","Action Required":"Offer skill‑based growth opportunities (machine operator, QC assistant)","Responsible Department":"HR + Production","Timeline":"60 days","Status":"Done"}}'),
('PEST', '2026', 'Technological', 'QC technology upgrade', 'Introduce digital testing tools', 'QA', '2026-01-10', '2026-02-19', NULL, NULL, 'Completed', '', '2026:2026:5', '{"fileName":"pest 2026.xlsx","sha256":"6c57e15261e47f79b0024a7b03b6e3cf781f9ab6f3006f4c9f4f6fe621c68a6d","sheet":"2026","row":5,"documentNumber":"MRM-QA-021-01","columns":{"Date":"2026-01-10","Issue Identified":"QC technology upgrade","Factor":"Technological","Action Required":"Introduce digital testing tools","Responsible Department":"QA","Timeline":"40 days","Status":"Done"}}'),
('PEST', '2026', 'Technological', 'Outdated ERP software', 'Make new software', 'IT', '2026-01-15', '2026-03-16', NULL, NULL, 'Completed', '', '2026:2026:6', '{"fileName":"pest 2026.xlsx","sha256":"6c57e15261e47f79b0024a7b03b6e3cf781f9ab6f3006f4c9f4f6fe621c68a6d","sheet":"2026","row":6,"documentNumber":"MRM-QA-021-01","columns":{"Date":"2026-01-15","Issue Identified":"Outdated ERP software","Factor":"Technological","Action Required":"Make new software","Responsible Department":"IT","Timeline":"60 days","Status":"Done"}}'),
('PEST', '2026', 'Social', 'Social festival and holidays', 'Planning leave as per GIDC rules.', 'HR', '2026-01-15', '2026-02-24', NULL, NULL, 'Completed', '', '2026:2026:7', '{"fileName":"pest 2026.xlsx","sha256":"6c57e15261e47f79b0024a7b03b6e3cf781f9ab6f3006f4c9f4f6fe621c68a6d","sheet":"2026","row":7,"documentNumber":"MRM-QA-021-01","columns":{"Date":"2026-01-15","Issue Identified":"Social festival and holidays ","Factor":"Social","Action Required":"Planning leave as per GIDC rules.","Responsible Department":"HR  ","Timeline":"40 days","Status":"Done"}}'),
('PEST', '2026', 'Economic', 'Interest Rates', 'Find alternate means of financing', 'Account', '2026-01-24', '2026-03-05', NULL, NULL, 'Completed', '', '2026:2026:8', '{"fileName":"pest 2026.xlsx","sha256":"6c57e15261e47f79b0024a7b03b6e3cf781f9ab6f3006f4c9f4f6fe621c68a6d","sheet":"2026","row":8,"documentNumber":"MRM-QA-021-01","columns":{"Date":"2026-01-24","Issue Identified":"Interest Rates","Factor":"Economical","Action Required":"Find alternate means of financing","Responsible Department":"Account","Timeline":"40 days","Status":"Done"}}'),
('PEST', '2026', 'Technological', 'Digital quality management software available', 'Make new software', 'IT', '2026-02-12', '2026-05-13', NULL, NULL, 'Open', '', '2026:2026:9', '{"fileName":"pest 2026.xlsx","sha256":"6c57e15261e47f79b0024a7b03b6e3cf781f9ab6f3006f4c9f4f6fe621c68a6d","sheet":"2026","row":9,"documentNumber":"MRM-QA-021-01","columns":{"Date":"2026-02-12","Issue Identified":"Digital quality management software available","Factor":"Technological","Action Required":"Make new software","Responsible Department":"IT","Timeline":"90 Days","Status":"pending"}}'),
('PEST', '2026', 'Economic', 'Customer demand for faster delivery', 'Improve production planning and dispatch process', 'Production + Planning', '2026-03-13', '2026-06-11', NULL, NULL, 'Open', '', '2026:2026:10', '{"fileName":"pest 2026.xlsx","sha256":"6c57e15261e47f79b0024a7b03b6e3cf781f9ab6f3006f4c9f4f6fe621c68a6d","sheet":"2026","row":10,"documentNumber":"MRM-QA-021-01","columns":{"Date":"2026-03-13","Issue Identified":"Customer demand for faster delivery","Factor":"Economical","Action Required":"Improve production planning and dispatch process","Responsible Department":"Production + Planning","Timeline":"90 Days","Status":"pending"}}'),
('PEST', '2026', 'Social', 'Employee satisfaction related to canteen facilities', 'Provide hygienic canteen facilities, improve food quality, and monitor employee feedback', 'HR + Admin', '2026-05-01', '2026-06-30', NULL, NULL, 'Open', '', '2026:2026:11', '{"fileName":"pest 2026.xlsx","sha256":"6c57e15261e47f79b0024a7b03b6e3cf781f9ab6f3006f4c9f4f6fe621c68a6d","sheet":"2026","row":11,"documentNumber":"MRM-QA-021-01","columns":{"Date":"2026-05-01","Issue Identified":"Employee satisfaction related to canteen facilities","Factor":"Social","Action Required":"Provide hygienic canteen facilities, improve food quality, and monitor employee feedback","Responsible Department":"HR + Admin","Timeline":"60 Days","Status":"Pending"}}')
), imported AS (
  INSERT INTO document_control.analysis_records (
    organization_id, kind, analysis_year, category, description, action_plan, department,
    identified_on, due_on, reviewed_on, next_review_on, status, completion_notes, source_key, source_payload
  ) SELECT organization.id, source.kind, source.analysis_year::integer, source.category,
    source.description, source.action_plan, source.department, source.identified_on::date,
    source.due_on::date, source.reviewed_on::date, source.next_review_on::date,
    source.status, source.completion_notes, source.source_key, source.source_payload::jsonb
  FROM source_rows source JOIN core.organizations organization ON lower(organization.code) = 'mrmpl'
  ON CONFLICT (organization_id, kind, source_key) DO NOTHING RETURNING *
)
INSERT INTO audit.events (
  organization_id, event_type, target_schema, target_table, target_id, actor_user_id,
  reason, before_state, after_state, metadata, source_system, source_table, source_id
) SELECT organization_id, 'iso_analysis.imported', 'document_control', 'analysis_records', id, NULL,
  'Initial supplied workbook import. Completed items await QA verification.', NULL,
  jsonb_build_object('kind', kind, 'analysisYear', analysis_year, 'category', category,
    'description', description, 'actionPlan', action_plan, 'department', department,
    'identifiedOn', identified_on, 'dueOn', due_on, 'reviewedOn', reviewed_on,
    'nextReviewOn', next_review_on, 'status', status, 'completionNotes', completion_notes),
  jsonb_build_object('actorName', 'Supplied workbook import', 'source', source_payload),
  'workbook-migration', 'iso-analysis-2026', id::text
FROM imported;
