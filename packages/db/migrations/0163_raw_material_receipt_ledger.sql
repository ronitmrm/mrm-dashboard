BEGIN;

DROP INDEX manufacturing.raw_material_receipts_number_unique;

CREATE INDEX raw_material_receipts_number_idx
  ON manufacturing.raw_material_receipts (
    organization_id,
    lower(receipt_number),
    lower(job_card_number)
  );

CREATE INDEX raw_material_receipts_job_card_date_idx
  ON manufacturing.raw_material_receipts (
    organization_id,
    lower(job_card_number),
    received_on,
    created_at
  );

COMMIT;
