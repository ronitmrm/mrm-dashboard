ALTER TABLE sales.followups
  ADD COLUMN IF NOT EXISTS quote_item_id uuid
    REFERENCES sales.quote_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'Email';

CREATE INDEX IF NOT EXISTS followups_quote_item_idx
  ON sales.followups (quote_item_id)
  WHERE quote_item_id IS NOT NULL;
