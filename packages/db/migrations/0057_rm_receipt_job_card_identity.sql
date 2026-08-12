ALTER TABLE manufacturing.raw_material_receipts
  ADD COLUMN job_card_number text;

UPDATE manufacturing.raw_material_receipts
SET job_card_number = COALESCE(
  NULLIF(btrim(source_payload->>'jcNo'), ''),
  NULLIF(btrim(source_payload->>'jobCard'), ''),
  receipt_number
);

ALTER TABLE manufacturing.raw_material_receipts
  ALTER COLUMN job_card_number SET NOT NULL;

DROP INDEX manufacturing.raw_material_receipts_number_unique;

CREATE UNIQUE INDEX raw_material_receipts_number_unique
  ON manufacturing.raw_material_receipts (
    organization_id,
    lower(receipt_number),
    lower(job_card_number)
  );
