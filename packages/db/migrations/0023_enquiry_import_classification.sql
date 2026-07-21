ALTER TABLE sales.enquiry_import_review_rows
  ADD COLUMN IF NOT EXISTS matched_quote_item_id uuid
    REFERENCES sales.quote_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_note text;

CREATE INDEX IF NOT EXISTS enquiry_import_review_rows_quote_idx
  ON sales.enquiry_import_review_rows (matched_quote_item_id)
  WHERE matched_quote_item_id IS NOT NULL;
