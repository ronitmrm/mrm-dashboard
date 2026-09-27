-- Keep each joined employee's post assignment after the current post is vacated.
CREATE TABLE recruitment.employee_post_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  post_id uuid REFERENCES recruitment.posts(id) ON DELETE SET NULL,
  post_code text NOT NULL,
  application_id uuid REFERENCES recruitment.applications(id) ON DELETE SET NULL,
  employee_name text NOT NULL,
  employee_code text,
  joined_on date,
  probation_due_on date,
  planned_end_on date,
  ended_on date,
  exit_type text CHECK (exit_type IN ('Resigned', 'Left Without Process', 'Unspecified')),
  exit_note text,
  pf_status text NOT NULL DEFAULT 'Pending'
    CHECK (pf_status IN ('Pending', 'Completed', 'Not Applicable', 'Unknown')),
  pf_completed_on date,
  uniform_status text NOT NULL DEFAULT 'Pending'
    CHECK (uniform_status IN ('Pending', 'Completed', 'Not Applicable', 'Unknown')),
  uniform_completed_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX employee_post_assignments_post_history
  ON recruitment.employee_post_assignments (organization_id, post_code, created_at DESC);
CREATE INDEX employee_post_assignments_application
  ON recruitment.employee_post_assignments (organization_id, application_id);
CREATE INDEX employee_post_assignments_followup
  ON recruitment.employee_post_assignments (organization_id, ended_on, probation_due_on);

-- Existing current assignments are a baseline. Their older transitions cannot
-- be reconstructed from the historical post audit events.
INSERT INTO recruitment.employee_post_assignments (
  organization_id, post_id, post_code, application_id, employee_name,
  employee_code, joined_on, planned_end_on, ended_on, exit_type,
  pf_status, uniform_status
)
SELECT post.organization_id, post.id, post.post_code,
  post.appointed_application_id,
  COALESCE(post.employee_name, post.employee_code), post.employee_code,
  post.joining_date, post.last_working_date,
  NULL,
  CASE WHEN post.status = 'Resigned' THEN 'Resigned' ELSE NULL END,
  'Unknown', 'Unknown'
FROM recruitment.posts post
WHERE post.status IN ('Occupied', 'Resigned')
  AND (post.employee_name IS NOT NULL OR post.employee_code IS NOT NULL);

-- Replacement snapshots retain outgoing people who are no longer on the post.
INSERT INTO recruitment.employee_post_assignments (
  organization_id, post_id, post_code, application_id, employee_name,
  employee_code, joined_on, planned_end_on, ended_on, exit_type,
  pf_status, uniform_status, created_at
)
SELECT replacement.organization_id, post.id, post.post_code,
  NULLIF(replacement.outgoing_assignment->>'appointed_application_id', '')::uuid,
  COALESCE(replacement.outgoing_assignment->>'employee_name',
    replacement.outgoing_assignment->>'employee_code'),
  replacement.outgoing_assignment->>'employee_code',
  migration.try_date(replacement.outgoing_assignment->>'joining_date'),
  migration.try_date(replacement.outgoing_assignment->>'last_working_date'),
  COALESCE(migration.try_date(replacement.outgoing_assignment->>'last_working_date'),
    replacement.completed_at::date),
  'Resigned', 'Unknown', 'Unknown',
  COALESCE(replacement.completed_at, replacement.created_at)
FROM recruitment.post_replacements replacement
JOIN recruitment.posts post ON post.id = replacement.post_id
WHERE replacement.status = 'Joined'
  AND (replacement.outgoing_assignment->>'employee_name' IS NOT NULL
    OR replacement.outgoing_assignment->>'employee_code' IS NOT NULL);

CREATE FUNCTION recruitment.track_employee_post_assignment() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_assignment_id uuid;
  previous_person boolean;
  corrected_identity boolean;
  probation_due date;
  offer_details jsonb;
  probation_length integer;
  effective_joined_on date;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    previous_person := OLD.status IN ('Occupied', 'Resigned')
      AND (OLD.employee_name IS NOT NULL OR OLD.employee_code IS NOT NULL);
    corrected_identity := NULLIF(current_setting('mrm.identity_correction', true), '') = 'true';

    IF previous_person THEN
      SELECT assignment.id INTO old_assignment_id
      FROM recruitment.employee_post_assignments assignment
      WHERE assignment.organization_id = OLD.organization_id
        AND assignment.post_id = OLD.id AND assignment.ended_on IS NULL
        AND assignment.employee_code IS NOT DISTINCT FROM OLD.employee_code
      ORDER BY assignment.created_at DESC LIMIT 1;

      IF old_assignment_id IS NULL THEN
        INSERT INTO recruitment.employee_post_assignments (
          organization_id, post_id, post_code, application_id,
          employee_name, employee_code, joined_on, planned_end_on,
          pf_status, uniform_status
        ) VALUES (
          OLD.organization_id, OLD.id, OLD.post_code, OLD.appointed_application_id,
          COALESCE(OLD.employee_name, OLD.employee_code),
          OLD.employee_code, OLD.joining_date,
          OLD.last_working_date, 'Unknown', 'Unknown'
        ) RETURNING id INTO old_assignment_id;
      END IF;

      IF corrected_identity AND NEW.status = 'Occupied' THEN
        UPDATE recruitment.employee_post_assignments
        SET employee_name = NEW.employee_name, employee_code = NEW.employee_code,
          updated_at = now()
        WHERE id = old_assignment_id;
        RETURN NEW;
      END IF;

      IF NEW.status NOT IN ('Occupied', 'Resigned')
          OR NEW.employee_code IS DISTINCT FROM OLD.employee_code
          OR NEW.employee_name IS DISTINCT FROM OLD.employee_name THEN
        UPDATE recruitment.employee_post_assignments
        SET ended_on = COALESCE(
              NULLIF(current_setting('mrm.employee_end_on', true), '')::date,
              OLD.last_working_date, current_date),
          exit_type = COALESCE(
              NULLIF(current_setting('mrm.employee_exit_type', true), ''),
              CASE WHEN OLD.status = 'Resigned' THEN 'Resigned'
                ELSE 'Unspecified' END),
          exit_note = NULLIF(current_setting('mrm.employee_exit_note', true), ''),
          updated_at = now()
        WHERE id = old_assignment_id;
      ELSIF NEW.status = 'Resigned' THEN
        UPDATE recruitment.employee_post_assignments
        SET planned_end_on = NEW.last_working_date, exit_type = 'Resigned',
          updated_at = now()
        WHERE id = old_assignment_id;
      END IF;
    END IF;

    IF NEW.status = 'Occupied' AND OLD.status = 'Occupied'
      AND NEW.employee_code IS NOT DISTINCT FROM OLD.employee_code
      AND NEW.employee_name IS NOT DISTINCT FROM OLD.employee_name THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.status <> 'Occupied'
    OR (NEW.employee_name IS NULL AND NEW.employee_code IS NULL) THEN
    RETURN NEW;
  END IF;

  effective_joined_on := NEW.joining_date;
  probation_due := NULLIF(current_setting('mrm.probation_due_on', true), '')::date;
  IF probation_due IS NULL AND effective_joined_on IS NOT NULL
    AND NEW.appointed_application_id IS NOT NULL THEN
    SELECT letter.details INTO offer_details
    FROM recruitment.employment_letters letter
    WHERE letter.organization_id = NEW.organization_id
      AND letter.application_id = NEW.appointed_application_id
      AND letter.letter_type = 'offer'
    ORDER BY letter.created_at DESC LIMIT 1;
    IF offer_details->>'probationLength' ~ '^[0-9]+$' THEN
      probation_length := (offer_details->>'probationLength')::integer;
      IF offer_details->>'probationUnit' = 'days' THEN
        probation_due := effective_joined_on + probation_length - 1;
      ELSIF offer_details->>'probationUnit' = 'months' THEN
        probation_due := (effective_joined_on
          + (probation_length || ' months')::interval - interval '1 day')::date;
      END IF;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM recruitment.employee_post_assignments assignment
    WHERE assignment.organization_id = NEW.organization_id
      AND assignment.post_id = NEW.id AND assignment.ended_on IS NULL
      AND assignment.employee_code IS NOT DISTINCT FROM NEW.employee_code
  ) THEN
    INSERT INTO recruitment.employee_post_assignments (
      organization_id, post_id, post_code, application_id, employee_name,
      employee_code, joined_on, probation_due_on
    ) VALUES (
      NEW.organization_id, NEW.id, NEW.post_code, NEW.appointed_application_id,
      COALESCE(NEW.employee_name, NEW.employee_code),
      NEW.employee_code, effective_joined_on, probation_due
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER track_employee_post_assignment
AFTER INSERT OR UPDATE OF employee_name, employee_code, status,
  joining_date, last_working_date, appointed_application_id
ON recruitment.posts
FOR EACH ROW EXECUTE FUNCTION recruitment.track_employee_post_assignment();

GRANT SELECT, INSERT, UPDATE ON recruitment.employee_post_assignments TO mrmpl_web;
GRANT SELECT ON recruitment.employee_post_assignments TO mrmpl_worker, mrmpl_reporting;
