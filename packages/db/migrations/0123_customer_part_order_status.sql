-- Customer order history survives price revisions and is independent of catalog P/Q.
CREATE TABLE sales.customer_part_order_status (
  organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES sales.customers(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES catalog.items(id) ON DELETE CASCADE,
  customer_part_code text NOT NULL CHECK (
    customer_part_code = lower(btrim(customer_part_code)) AND customer_part_code <> ''
  ),
  status text NOT NULL CHECK (status IN ('Q', 'P')),
  source_kind text NOT NULL CHECK (source_kind IN ('migration', 'pi_approval')),
  source_reference text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, customer_id, item_id, customer_part_code)
);

GRANT SELECT, INSERT, UPDATE ON sales.customer_part_order_status TO mrmpl_web;
GRANT SELECT ON sales.customer_part_order_status TO mrmpl_reporting;

-- Only actual approved PIs establish an order; Sent/Accepted quote flags alone do not.
INSERT INTO sales.customer_part_order_status (
  organization_id, customer_id, item_id, customer_part_code,
  status, source_kind, source_reference
)
SELECT DISTINCT ON (quote.organization_id, quote.customer_id, quote.item_id,
  lower(btrim(quote.customer_part_code)))
  quote.organization_id, quote.customer_id, quote.item_id,
  lower(btrim(quote.customer_part_code)), 'P', 'pi_approval', invoice.id::text
FROM sales.proforma_invoices invoice
JOIN sales.proforma_invoice_lines line ON line.proforma_invoice_id = invoice.id
JOIN sales.quote_items quote ON quote.id = line.quote_item_id
WHERE invoice.status = 'Approved'
  AND nullif(btrim(quote.customer_part_code), '') IS NOT NULL
ORDER BY quote.organization_id, quote.customer_id, quote.item_id,
  lower(btrim(quote.customer_part_code)), invoice.approved_at;
