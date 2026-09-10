CREATE TABLE sales.quotation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  enquiry_id uuid NOT NULL REFERENCES sales.enquiries(id),
  revision integer NOT NULL CHECK (revision >= 0),
  status text NOT NULL CHECK (status IN ('Draft', 'Sent')),
  terms_snapshot jsonb,
  lines_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  quote_item_id uuid REFERENCES sales.quote_items(id),
  file_id uuid REFERENCES core.files(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE(enquiry_id, revision),
  CHECK ((status = 'Sent') = (sent_at IS NOT NULL))
);
CREATE UNIQUE INDEX quotation_one_draft ON sales.quotation_versions(enquiry_id) WHERE status = 'Draft';
GRANT SELECT, INSERT, UPDATE ON sales.quotation_versions TO mrmpl_web;

-- Legacy initial sends were per part. Collapse first sends into Original;
-- subsequent full-enquiry sends share a transaction timestamp.
WITH ranked AS (
  SELECT q.*, row_number() OVER (PARTITION BY enquiry_id,enquiry_item_id ORDER BY sent_at,created_at,id) AS occurrence
  FROM sales.quote_items q WHERE enquiry_id IS NOT NULL AND sent_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM sales.quote_package_components c WHERE c.child_quote_item_id=q.id)
), batches AS (
  SELECT enquiry_id, max(sent_at) AS sent_at FROM ranked WHERE occurrence=1 GROUP BY enquiry_id
  UNION
  SELECT enquiry_id,sent_at FROM ranked WHERE occurrence>1
), numbered AS (
  SELECT *, row_number() OVER (PARTITION BY enquiry_id ORDER BY sent_at)-1 AS revision FROM batches
)
INSERT INTO sales.quotation_versions(organization_id,enquiry_id,revision,status,sent_at,created_at,quote_item_id)
SELECT e.organization_id,e.id,n.revision,'Sent',n.sent_at,n.sent_at,
  (SELECT q.id FROM sales.quote_items q WHERE q.enquiry_id=e.id AND q.sent_at<=n.sent_at ORDER BY q.sent_at DESC,q.id DESC LIMIT 1)
FROM numbered n JOIN sales.enquiries e ON e.id=n.enquiry_id;

UPDATE sales.quotation_versions v SET lines_snapshot = COALESCE((
  SELECT jsonb_agg(jsonb_build_object('enquiryItemId',i.id,'quoteItemId',q.id,'lineNumber',i.line_number,
    'productCode',p.uid,'customerPartCode',q.customer_part_code,'description',i.description,
    'quantity',q.quantity,'price',q.unit_price,'itemRevision',q.revision) ORDER BY i.line_number)
  FROM sales.enquiry_items i
  JOIN LATERAL (SELECT * FROM sales.quote_items q WHERE q.enquiry_item_id=i.id AND q.sent_at<=v.sent_at
    ORDER BY q.sent_at DESC,q.created_at DESC,q.id DESC LIMIT 1) q ON true
  LEFT JOIN catalog.items p ON p.id=q.item_id
  WHERE i.enquiry_id=v.enquiry_id AND i.linked_enquiry_item_id IS NULL
),'[]'::jsonb), file_id = (
  SELECT link.file_id FROM core.file_links link JOIN sales.quote_items q ON q.id=link.target_id
  WHERE link.target_schema='sales' AND link.target_table='quote_items' AND link.purpose='issued_quote_pdf'
    AND q.enquiry_id=v.enquiry_id AND q.sent_at<=v.sent_at
  ORDER BY q.sent_at DESC,link.version DESC LIMIT 1
);
-- Historical terms were not snapshotted. Keep NULL; the original PDF is evidence.
