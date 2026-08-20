ALTER TABLE sales.customers
  ADD COLUMN IF NOT EXISTS default_buyer_name text,
  ADD COLUMN IF NOT EXISTS default_incoterms text,
  ADD COLUMN IF NOT EXISTS default_payment_terms text,
  ADD COLUMN IF NOT EXISTS default_shipment_mode text,
  ADD COLUMN IF NOT EXISTS default_packaging_terms text,
  ADD COLUMN IF NOT EXISTS default_currency text;
