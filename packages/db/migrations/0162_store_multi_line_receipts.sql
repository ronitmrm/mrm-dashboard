BEGIN;

ALTER TABLE store.receipts
  ADD COLUMN purchase_order_id uuid REFERENCES store.purchase_orders(id);

UPDATE store.receipts receipt
SET purchase_order_id = line.purchase_order_id
FROM store.purchase_order_lines line
WHERE line.id = receipt.purchase_order_line_id;

ALTER TABLE store.receipt_lines
  ADD COLUMN purchase_order_line_id uuid REFERENCES store.purchase_order_lines(id);

UPDATE store.receipt_lines receipt_line
SET purchase_order_line_id = receipt.purchase_order_line_id
FROM store.receipts receipt
WHERE receipt.id = receipt_line.receipt_id;

CREATE INDEX store_receipts_purchase_order_header_idx
  ON store.receipts (organization_id, purchase_order_id, received_at DESC)
  WHERE purchase_order_id IS NOT NULL;
CREATE INDEX store_receipt_lines_purchase_order_line_idx
  ON store.receipt_lines (organization_id, purchase_order_line_id)
  WHERE purchase_order_line_id IS NOT NULL;
CREATE UNIQUE INDEX store_receipt_lines_order_line_unique
  ON store.receipt_lines (receipt_id, purchase_order_line_id)
  WHERE purchase_order_line_id IS NOT NULL;

COMMIT;
