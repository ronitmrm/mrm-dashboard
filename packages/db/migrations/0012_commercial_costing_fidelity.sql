ALTER TABLE sales.quote_items
  ADD COLUMN IF NOT EXISTS enquiry_id uuid
    REFERENCES sales.enquiries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_type text NOT NULL DEFAULT 'New Item Quote',
  ADD COLUMN IF NOT EXISTS packaging text,
  ADD COLUMN IF NOT EXISTS shipping_terms text,
  ADD COLUMN IF NOT EXISTS scrap_rate numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alloy_premium numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extrusion_cost numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forging_cost numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packing_cost numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_cost numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_cost_input numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_times numeric(20,8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS profit_percent numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_rate numeric(20,8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS assembled_part_inr numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_inr numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_rate_inr numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_usd numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_price_usd numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calculation_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS price_lineage_key text;

CREATE INDEX quote_items_enquiry_idx
  ON sales.quote_items (enquiry_id, item_id, status, revision DESC);

CREATE UNIQUE INDEX quote_items_one_active_lineage
  ON sales.quote_items (organization_id, customer_id, price_lineage_key)
  WHERE is_active AND price_lineage_key IS NOT NULL;

ALTER TABLE sales.quote_product_snapshots
  ADD COLUMN IF NOT EXISTS product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS calculation_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE sales.quote_package_components
  ADD COLUMN IF NOT EXISTS child_quote_item_id uuid
    REFERENCES sales.quote_items(id) ON DELETE SET NULL;

CREATE INDEX quote_package_components_child_quote_idx
  ON sales.quote_package_components (child_quote_item_id);

CREATE OR REPLACE FUNCTION sales.protect_sent_quote_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.sent_at IS NOT NULL
     AND (
       to_jsonb(NEW) - ARRAY[
         'status', 'is_active', 'superseded_by_quote_item_id',
         'updated_at', 'row_version'
       ]::text[]
     ) IS DISTINCT FROM (
       to_jsonb(OLD) - ARRAY[
         'status', 'is_active', 'superseded_by_quote_item_id',
         'updated_at', 'row_version'
       ]::text[]
     ) THEN
    RAISE EXCEPTION 'Sent quote history is immutable.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_items_sent_immutable ON sales.quote_items;
CREATE TRIGGER quote_items_sent_immutable
  BEFORE UPDATE ON sales.quote_items
  FOR EACH ROW EXECUTE FUNCTION sales.protect_sent_quote_item();

CREATE OR REPLACE FUNCTION sales.protect_sent_quote_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  protected_quote_id uuid;
  protected_sent_at timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    protected_quote_id := OLD.quote_item_id;
  ELSE
    protected_quote_id := NEW.quote_item_id;
  END IF;

  SELECT sent_at INTO protected_sent_at
  FROM sales.quote_items
  WHERE id = protected_quote_id;

  IF protected_sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'Sent quote snapshots are immutable.' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_product_snapshots_sent_immutable
  ON sales.quote_product_snapshots;
CREATE TRIGGER quote_product_snapshots_sent_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON sales.quote_product_snapshots
  FOR EACH ROW EXECUTE FUNCTION sales.protect_sent_quote_snapshot();

CREATE OR REPLACE FUNCTION sales.protect_sent_quote_component()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  protected_snapshot_id uuid;
  protected_sent_at timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    protected_snapshot_id := OLD.quote_product_snapshot_id;
  ELSE
    protected_snapshot_id := NEW.quote_product_snapshot_id;
  END IF;

  SELECT quote_item.sent_at INTO protected_sent_at
  FROM sales.quote_product_snapshots snapshot
  JOIN sales.quote_items quote_item ON quote_item.id = snapshot.quote_item_id
  WHERE snapshot.id = protected_snapshot_id;

  IF protected_sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'Sent quote component snapshots are immutable.' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_package_components_sent_immutable
  ON sales.quote_package_components;
CREATE TRIGGER quote_package_components_sent_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON sales.quote_package_components
  FOR EACH ROW EXECUTE FUNCTION sales.protect_sent_quote_component();
