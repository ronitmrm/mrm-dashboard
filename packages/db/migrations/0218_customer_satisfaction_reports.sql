CREATE TABLE document_control.customer_satisfaction_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES core.organizations(id),
  record_number integer GENERATED ALWAYS AS IDENTITY UNIQUE,fields jsonb NOT NULL CHECK(jsonb_typeof(fields)='object'),
  status text NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Submitted','Approved','Returned')),
  version integer NOT NULL DEFAULT 1,decision_notes text NOT NULL DEFAULT '',
  created_by_user_id uuid REFERENCES identity.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_satisfaction_register ON document_control.customer_satisfaction_reports(organization_id,record_number DESC);
GRANT SELECT,INSERT,UPDATE ON document_control.customer_satisfaction_reports TO mrmpl_web;
GRANT USAGE,SELECT ON SEQUENCE document_control.customer_satisfaction_reports_record_number_seq TO mrmpl_web;
GRANT SELECT ON document_control.customer_satisfaction_reports TO mrmpl_reporting;
INSERT INTO identity.permissions(key,module,name,description) VALUES
 ('iso.satisfaction.read','iso-document','View customer satisfaction reports','View report monitoring details, original files and follow-up status.'),
 ('iso.satisfaction.manage','iso-document','Manage customer satisfaction reports','Create reports and assign staff. Responsible staff can prepare and upload their own draft reports.'),
 ('iso.satisfaction.verify','iso-document','QA review customer satisfaction reports','Approve, return or reopen reports with retained review findings. Follow-up actions retain their own QA closure.');
INSERT INTO identity.role_permissions(role_id,permission_id)
SELECT role.id,permission.id FROM identity.roles role CROSS JOIN identity.permissions permission
WHERE (role.key IN ('administrator','quality-assurance-hod') AND permission.key LIKE 'iso.satisfaction.%') OR (role.key='department-manager' AND permission.key='iso.satisfaction.read') ON CONFLICT DO NOTHING;
