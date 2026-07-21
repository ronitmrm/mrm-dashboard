-- Cancellation is an allowed status correction for an issued PI, but its
-- historical commercial values and lines remain immutable.

CREATE OR REPLACE FUNCTION sales.protect_issued_proforma_invoice()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('Sent', 'Approved')
     AND (
       to_jsonb(NEW) - ARRAY[
         'status', 'approved_at', 'approved_by_user_id',
         'cancellation_reason', 'updated_at', 'updated_by_user_id',
         'row_version'
       ]::text[]
     ) IS DISTINCT FROM (
       to_jsonb(OLD) - ARRAY[
         'status', 'approved_at', 'approved_by_user_id',
         'cancellation_reason', 'updated_at', 'updated_by_user_id',
         'row_version'
       ]::text[]
     ) THEN
    RAISE EXCEPTION 'Issued proforma invoice history is immutable.'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
