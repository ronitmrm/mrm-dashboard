CREATE TABLE sales.enquiry_revision_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  enquiry_id uuid NOT NULL REFERENCES sales.enquiries(id),
  kind text NOT NULL CHECK (kind IN ('Terms', 'Pricing', 'Technical')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Completed')),
  terms_before jsonb NOT NULL,
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX enquiry_revision_one_open ON sales.enquiry_revision_requests(enquiry_id) WHERE status = 'Open';
CREATE TABLE sales.enquiry_revision_lines (
  request_id uuid NOT NULL REFERENCES sales.enquiry_revision_requests(id),
  enquiry_item_id uuid NOT NULL REFERENCES sales.enquiry_items(id),
  previous_quote_item_id uuid REFERENCES sales.quote_items(id),
  engineering_change_note_id uuid REFERENCES sales.engineering_change_notes(id),
  PRIMARY KEY (request_id, enquiry_item_id)
);
ALTER TABLE sales.enquiry_items ADD COLUMN revision_stage text
  CHECK (revision_stage IN ('Sales', 'Design', 'Product Costing', 'Customer Costing', 'Ready To Send'));
GRANT SELECT, INSERT, UPDATE ON sales.enquiry_revision_requests, sales.enquiry_revision_lines TO mrmpl_web;
