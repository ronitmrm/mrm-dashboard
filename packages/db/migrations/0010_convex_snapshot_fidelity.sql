ALTER TABLE manufacturing.route_options
  ADD COLUMN legacy_option_number text;

ALTER TABLE manufacturing.operation_setups
  ADD COLUMN legacy_setup_code text;

ALTER TABLE manufacturing.work_orders
  DROP CONSTRAINT work_orders_ordered_quantity_check;

ALTER TABLE manufacturing.work_orders
  ADD CONSTRAINT work_orders_ordered_quantity_check
  CHECK (ordered_quantity >= 0);

ALTER TABLE manufacturing.raw_material_receipts
  DROP CONSTRAINT raw_material_receipts_quantity_kg_check;

ALTER TABLE manufacturing.raw_material_receipts
  ADD CONSTRAINT raw_material_receipts_quantity_kg_check
  CHECK (quantity_kg >= 0);

CREATE OR REPLACE FUNCTION migration.try_numeric(value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF value IS NULL OR btrim(value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN btrim(value)::numeric;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION migration.try_date(value text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF value IS NULL OR btrim(value) = '' THEN
    RETURN NULL;
  END IF;
  IF btrim(value) ~ '^\d{2}/\d{2}/\d{4}$' THEN
    RETURN to_date(btrim(value), 'DD/MM/YYYY');
  END IF;
  RETURN btrim(value)::date;
EXCEPTION
  WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION migration.try_timestamptz(value text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF value IS NULL OR btrim(value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN btrim(value)::timestamptz;
EXCEPTION
  WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RETURN NULL;
END;
$$;
