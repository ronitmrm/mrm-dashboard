-- Retain generated employment letters independently of mutable Approved Posts.

CREATE SEQUENCE IF NOT EXISTS recruitment.employment_letter_reference_seq;

CREATE TABLE recruitment.employment_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  letter_type text NOT NULL
    CHECK (letter_type IN ('offer', 'appointment', 'experience')),
  application_id uuid REFERENCES recruitment.applications(id) ON DELETE SET NULL,
  post_id uuid REFERENCES recruitment.posts(id) ON DELETE SET NULL,
  employee_name text NOT NULL,
  employee_code text,
  designation text NOT NULL,
  department text NOT NULL,
  joining_date date NOT NULL,
  last_working_date date,
  reference_number text NOT NULL,
  issued_on date NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_bytes bytea,
  pdf_file_name text,
  pdf_sha256 text CHECK (pdf_sha256 IS NULL OR length(pdf_sha256) = 64),
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id),
  UNIQUE (organization_id, reference_number),
  CHECK (letter_type = 'offer' OR employee_code IS NOT NULL),
  CHECK (
    (pdf_bytes IS NULL AND pdf_file_name IS NULL AND pdf_sha256 IS NULL
      AND generated_at IS NULL)
    OR
    (pdf_bytes IS NOT NULL AND pdf_file_name IS NOT NULL
      AND pdf_sha256 IS NOT NULL AND generated_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX recruitment_offer_letter_application_unique
  ON recruitment.employment_letters (organization_id, application_id)
  WHERE letter_type = 'offer' AND application_id IS NOT NULL;

CREATE UNIQUE INDEX recruitment_employee_letter_type_unique
  ON recruitment.employment_letters (
    organization_id, letter_type, lower(employee_code)
  )
  WHERE letter_type IN ('appointment', 'experience')
    AND employee_code IS NOT NULL;

CREATE INDEX recruitment_employment_letters_employee_idx
  ON recruitment.employment_letters (
    organization_id, lower(employee_name), issued_on DESC
  );

GRANT USAGE, SELECT ON SEQUENCE recruitment.employment_letter_reference_seq
  TO mrmpl_web;
GRANT SELECT, INSERT, UPDATE ON recruitment.employment_letters TO mrmpl_web;
GRANT SELECT ON recruitment.employment_letters TO mrmpl_worker, mrmpl_reporting;
