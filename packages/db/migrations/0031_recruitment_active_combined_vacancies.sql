-- Retired combined-role history may reuse the vacancy code of its active
-- replacement. Only active combined roles must be unique.

DROP INDEX IF EXISTS recruitment.recruitment_combined_roles_vacancy_unique;

CREATE UNIQUE INDEX recruitment_combined_roles_vacancy_unique
  ON recruitment.combined_roles (organization_id, lower(vacancy_code))
  WHERE status = 'Active'
    AND vacancy_code IS NOT NULL
    AND btrim(vacancy_code) <> '';
