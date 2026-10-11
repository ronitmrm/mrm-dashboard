-- Preserve recorded/Offer Letter dates; direct joins default at the source.
CREATE FUNCTION recruitment.default_direct_join_probation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.probation_due_on IS NULL AND NEW.application_id IS NULL
    AND NEW.joined_on IS NOT NULL THEN
    NEW.probation_due_on := (NEW.joined_on + interval '1 month')::date;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER default_direct_join_probation
BEFORE INSERT ON recruitment.employee_post_assignments
FOR EACH ROW EXECUTE FUNCTION recruitment.default_direct_join_probation();

UPDATE recruitment.employee_post_assignments
SET probation_due_on = (joined_on + interval '1 month')::date, updated_at = now()
WHERE probation_due_on IS NULL AND application_id IS NULL AND joined_on IS NOT NULL;
