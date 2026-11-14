-- Replacing a resigned employee must retain how they left and their exit note.
CREATE FUNCTION recruitment.preserve_employee_departure_details() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.ended_on IS NULL AND NEW.ended_on IS NOT NULL THEN
    IF NULLIF(current_setting('mrm.employee_exit_type', true), '') IS NULL THEN
      NEW.exit_type := COALESCE(OLD.exit_type, NEW.exit_type);
    END IF;
    IF NULLIF(current_setting('mrm.employee_exit_note', true), '') IS NULL THEN
      NEW.exit_note := COALESCE(OLD.exit_note, NEW.exit_note);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER preserve_employee_departure_details
BEFORE UPDATE OF ended_on ON recruitment.employee_post_assignments
FOR EACH ROW EXECUTE FUNCTION recruitment.preserve_employee_departure_details();
