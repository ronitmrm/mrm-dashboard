BEGIN;

CREATE TABLE manufacturing.job_card_finish_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  work_order_id uuid NOT NULL REFERENCES manufacturing.work_orders(id),
  raw_material_receipt_id uuid NOT NULL
    REFERENCES manufacturing.raw_material_receipts(id),
  rm_received_on date NOT NULL,
  planned_finish_on date,
  requested_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz,
  CONSTRAINT job_card_finish_baselines_capture_pair_check CHECK (
    (planned_finish_on IS NULL AND captured_at IS NULL)
    OR (planned_finish_on IS NOT NULL AND captured_at IS NOT NULL)
  ),
  UNIQUE (organization_id, work_order_id),
  UNIQUE (raw_material_receipt_id)
);

COMMENT ON TABLE manufacturing.job_card_finish_baselines IS
  'Immutable first valid finish forecast requested by a Job Card first RM receipt.';

CREATE FUNCTION manufacturing.request_job_card_finish_baseline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, manufacturing
AS $$
DECLARE
  target_work_order_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM manufacturing.raw_material_receipts receipt
    WHERE receipt.organization_id = NEW.organization_id
      AND lower(receipt.job_card_number) = lower(NEW.job_card_number)
      AND receipt.id <> NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT work_order.id
  INTO target_work_order_id
  FROM manufacturing.work_orders work_order
  WHERE work_order.organization_id = NEW.organization_id
    AND lower(work_order.job_card_number) = lower(NEW.job_card_number)
  LIMIT 1;

  IF target_work_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO manufacturing.job_card_finish_baselines (
    organization_id,
    work_order_id,
    raw_material_receipt_id,
    rm_received_on
  )
  VALUES (
    NEW.organization_id,
    target_work_order_id,
    NEW.id,
    NEW.received_on
  )
  ON CONFLICT (organization_id, work_order_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION manufacturing.request_job_card_finish_baseline()
  FROM PUBLIC;

CREATE TRIGGER request_job_card_finish_baseline
AFTER INSERT ON manufacturing.raw_material_receipts
FOR EACH ROW
EXECUTE FUNCTION manufacturing.request_job_card_finish_baseline();

CREATE FUNCTION manufacturing.enforce_job_card_finish_baseline_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, manufacturing
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Job Card finish baselines cannot be deleted.';
  END IF;

  IF OLD.planned_finish_on IS NOT NULL OR OLD.captured_at IS NOT NULL THEN
    RAISE EXCEPTION 'A captured Job Card finish baseline cannot be changed.';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.work_order_id IS DISTINCT FROM OLD.work_order_id
    OR NEW.raw_material_receipt_id IS DISTINCT FROM OLD.raw_material_receipt_id
    OR NEW.rm_received_on IS DISTINCT FROM OLD.rm_received_on
    OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
    OR NEW.planned_finish_on IS NULL
    OR NEW.captured_at IS NULL
  THEN
    RAISE EXCEPTION 'Only the first valid Job Card finish forecast may be captured.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_job_card_finish_baseline_immutability
BEFORE UPDATE OR DELETE ON manufacturing.job_card_finish_baselines
FOR EACH ROW
EXECUTE FUNCTION manufacturing.enforce_job_card_finish_baseline_immutability();

REVOKE ALL ON manufacturing.job_card_finish_baselines
  FROM mrmpl_web, mrmpl_worker, mrmpl_reporting;
GRANT SELECT ON manufacturing.job_card_finish_baselines
  TO mrmpl_web, mrmpl_worker, mrmpl_reporting;
GRANT UPDATE (planned_finish_on, captured_at)
  ON manufacturing.job_card_finish_baselines TO mrmpl_worker;

COMMIT;
