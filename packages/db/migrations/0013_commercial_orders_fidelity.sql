-- Preserve the Pricing purchase-order and proforma-invoice workflow on PostgreSQL.

ALTER TABLE catalog.items
  ADD COLUMN IF NOT EXISTS converted_from_quote_uid text;

ALTER TABLE sales.quote_items
  ADD COLUMN IF NOT EXISTS ordered_at timestamptz;

ALTER TABLE sales.purchase_orders
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS quote_enquiry_id uuid
    REFERENCES sales.enquiries(id) ON DELETE SET NULL;

ALTER TABLE sales.purchase_order_lines
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS matched_item_id uuid
    REFERENCES catalog.items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS system_price numeric(18,6),
  ADD COLUMN IF NOT EXISTS price_difference numeric(18,6),
  ADD COLUMN IF NOT EXISTS decision text NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS decision_comment text,
  ADD COLUMN IF NOT EXISTS pi_price numeric(18,6),
  ADD COLUMN IF NOT EXISTS system_quote_revision integer,
  ADD COLUMN IF NOT EXISTS system_scrap_rate numeric(20,8),
  ADD COLUMN IF NOT EXISTS system_purchase_times numeric(20,8),
  ADD COLUMN IF NOT EXISTS system_profit_percent numeric(20,8),
  ADD COLUMN IF NOT EXISTS system_shipping_terms text,
  ADD COLUMN IF NOT EXISTS system_packaging text;

CREATE TABLE sales.quote_revision_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  purchase_order_line_id uuid NOT NULL
    REFERENCES sales.purchase_order_lines(id) ON DELETE CASCADE,
  quote_item_id uuid NOT NULL REFERENCES sales.quote_items(id),
  item_id uuid NOT NULL REFERENCES catalog.items(id),
  requested_price numeric(18,6) NOT NULL CHECK (requested_price >= 0),
  currency_code text NOT NULL,
  status text NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open', 'Resolved', 'Cancelled')),
  resolution_comment text,
  resolved_quote_item_id uuid REFERENCES sales.quote_items(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE UNIQUE INDEX quote_revision_requests_one_open_line
  ON sales.quote_revision_requests (purchase_order_line_id)
  WHERE status = 'Open';

CREATE INDEX quote_revision_requests_status_idx
  ON sales.quote_revision_requests (organization_id, status, created_at);

ALTER TABLE sales.proforma_invoices
  DROP CONSTRAINT IF EXISTS proforma_invoices_status_check;

ALTER TABLE sales.proforma_invoices
  ADD CONSTRAINT proforma_invoices_status_check
    CHECK (status IN ('Draft', 'Sent', 'Approved', 'Cancelled', 'Superseded')),
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_by_user_id uuid
    REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE OR REPLACE FUNCTION sales.protect_sent_quote_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.sent_at IS NOT NULL
     AND (
       to_jsonb(NEW) - ARRAY[
         'status', 'is_active', 'superseded_by_quote_item_id', 'ordered_at',
         'updated_at', 'updated_by_user_id', 'row_version'
       ]::text[]
     ) IS DISTINCT FROM (
       to_jsonb(OLD) - ARRAY[
         'status', 'is_active', 'superseded_by_quote_item_id', 'ordered_at',
         'updated_at', 'updated_by_user_id', 'row_version'
       ]::text[]
     ) THEN
    RAISE EXCEPTION 'Sent quote history is immutable.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sales.protect_issued_proforma_invoice()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('Sent', 'Approved')
     AND (
       to_jsonb(NEW) - ARRAY[
         'status', 'approved_at', 'approved_by_user_id',
         'updated_at', 'updated_by_user_id', 'row_version'
       ]::text[]
     ) IS DISTINCT FROM (
       to_jsonb(OLD) - ARRAY[
         'status', 'approved_at', 'approved_by_user_id',
         'updated_at', 'updated_by_user_id', 'row_version'
       ]::text[]
     ) THEN
    RAISE EXCEPTION 'Issued proforma invoice history is immutable.'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proforma_invoices_issued_immutable
  ON sales.proforma_invoices;
CREATE TRIGGER proforma_invoices_issued_immutable
  BEFORE UPDATE ON sales.proforma_invoices
  FOR EACH ROW EXECUTE FUNCTION sales.protect_issued_proforma_invoice();

CREATE OR REPLACE FUNCTION sales.protect_issued_proforma_invoice_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  invoice_id uuid;
  invoice_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    invoice_id := OLD.proforma_invoice_id;
  ELSE
    invoice_id := NEW.proforma_invoice_id;
  END IF;

  SELECT status INTO invoice_status
  FROM sales.proforma_invoices
  WHERE id = invoice_id;

  IF invoice_status IN ('Sent', 'Approved') THEN
    RAISE EXCEPTION 'Issued proforma invoice lines are immutable.'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proforma_invoice_lines_issued_immutable
  ON sales.proforma_invoice_lines;
CREATE TRIGGER proforma_invoice_lines_issued_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON sales.proforma_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION sales.protect_issued_proforma_invoice_line();
