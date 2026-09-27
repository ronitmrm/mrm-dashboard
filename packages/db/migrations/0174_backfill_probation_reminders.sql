-- Existing joined assignments can inherit the probation period from their
-- retained Offer Letter, just as new joins do in migration 0173's trigger.
WITH eligible AS (
  SELECT assignment.id,
    CASE letter.details->>'probationUnit'
      WHEN 'days' THEN assignment.joined_on + terms.probation_length - 1
      WHEN 'months' THEN (assignment.joined_on
        + (terms.probation_length || ' months')::interval - interval '1 day')::date
    END AS due_on
  FROM recruitment.employee_post_assignments assignment
  JOIN LATERAL (
    SELECT details FROM recruitment.employment_letters letter
    WHERE letter.organization_id = assignment.organization_id
      AND letter.application_id = assignment.application_id
      AND letter.letter_type = 'offer'
    ORDER BY letter.created_at DESC LIMIT 1
  ) letter ON true
  CROSS JOIN LATERAL (
    SELECT CASE WHEN letter.details->>'probationLength' ~ '^[0-9]{1,4}$'
      THEN (letter.details->>'probationLength')::integer END AS probation_length
  ) terms
  WHERE assignment.probation_due_on IS NULL
    AND assignment.joined_on IS NOT NULL
    AND terms.probation_length > 0
    AND letter.details->>'probationUnit' IN ('days', 'months')
)
UPDATE recruitment.employee_post_assignments assignment
SET probation_due_on = eligible.due_on, updated_at = now()
FROM eligible
WHERE assignment.id = eligible.id;
