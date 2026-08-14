-- Normalize existing human-readable recruitment names and labels.
-- Codes, identifiers, contact details, technical values, and notes are excluded.

CREATE OR REPLACE FUNCTION migration.proper_case_user_text(value text)
RETURNS text
LANGUAGE sql
STABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT initcap(
    lower(regexp_replace(btrim(value), '[[:space:]]+', ' ', 'g'))
  );
$$;

UPDATE recruitment.departments
SET name = migration.proper_case_user_text(name),
  updated_at = now(), row_version = row_version + 1
WHERE name IS DISTINCT FROM migration.proper_case_user_text(name)
  AND NOT EXISTS (
    SELECT 1
    FROM recruitment.departments duplicate
    WHERE duplicate.organization_id = departments.organization_id
      AND duplicate.id <> departments.id
      AND lower(migration.proper_case_user_text(duplicate.name)) =
        lower(migration.proper_case_user_text(departments.name))
  );

UPDATE recruitment.designations
SET name = migration.proper_case_user_text(name),
  updated_at = now(), row_version = row_version + 1
WHERE name IS DISTINCT FROM migration.proper_case_user_text(name)
  AND NOT EXISTS (
    SELECT 1
    FROM recruitment.designations duplicate
    WHERE duplicate.organization_id = designations.organization_id
      AND duplicate.id <> designations.id
      AND lower(migration.proper_case_user_text(duplicate.name)) =
        lower(migration.proper_case_user_text(designations.name))
  );

UPDATE recruitment.combined_roles
SET name = migration.proper_case_user_text(name),
  employee_name = CASE
    WHEN nullif(btrim(employee_name), '') IS NULL THEN employee_name
    ELSE migration.proper_case_user_text(employee_name)
  END,
  updated_at = now(), row_version = row_version + 1
WHERE name IS DISTINCT FROM migration.proper_case_user_text(name)
  OR employee_name IS DISTINCT FROM CASE
    WHEN nullif(btrim(employee_name), '') IS NULL THEN employee_name
    ELSE migration.proper_case_user_text(employee_name)
  END;

UPDATE recruitment.requirement_templates
SET name = migration.proper_case_user_text(name),
  updated_at = now(), row_version = row_version + 1
WHERE name IS DISTINCT FROM migration.proper_case_user_text(name);

UPDATE recruitment.posts
SET employee_name = migration.proper_case_user_text(employee_name),
  updated_at = now(), row_version = row_version + 1
WHERE nullif(btrim(employee_name), '') IS NOT NULL
  AND employee_name IS DISTINCT FROM
    migration.proper_case_user_text(employee_name);

UPDATE recruitment.candidates
SET name = migration.proper_case_user_text(name),
  current_company = CASE
    WHEN nullif(btrim(current_company), '') IS NULL THEN current_company
    ELSE migration.proper_case_user_text(current_company)
  END,
  updated_at = now(), row_version = row_version + 1
WHERE name IS DISTINCT FROM migration.proper_case_user_text(name)
  OR current_company IS DISTINCT FROM CASE
    WHEN nullif(btrim(current_company), '') IS NULL THEN current_company
    ELSE migration.proper_case_user_text(current_company)
  END;

UPDATE recruitment.job_posts
SET title = migration.proper_case_user_text(title),
  updated_at = now(), row_version = row_version + 1
WHERE title IS DISTINCT FROM migration.proper_case_user_text(title);

UPDATE recruitment.interviews
SET interviewer_name = migration.proper_case_user_text(interviewer_name),
  updated_at = now(), row_version = row_version + 1
WHERE nullif(btrim(interviewer_name), '') IS NOT NULL
  AND interviewer_name IS DISTINCT FROM
    migration.proper_case_user_text(interviewer_name);
