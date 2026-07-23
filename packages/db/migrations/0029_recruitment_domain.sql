-- Bring HR Recruitment into the canonical PostgreSQL runtime.

CREATE SCHEMA IF NOT EXISTS recruitment;

CREATE TABLE recruitment.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE UNIQUE INDEX recruitment_departments_code_unique
  ON recruitment.departments (organization_id, lower(code));
CREATE UNIQUE INDEX recruitment_departments_name_unique
  ON recruitment.departments (organization_id, lower(name));

CREATE TABLE recruitment.designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE UNIQUE INDEX recruitment_designations_code_unique
  ON recruitment.designations (organization_id, lower(code));
CREATE UNIQUE INDEX recruitment_designations_name_unique
  ON recruitment.designations (organization_id, lower(name));

CREATE TABLE recruitment.combined_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL,
  vacancy_code text,
  employee_name text,
  employee_code text,
  status text NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE UNIQUE INDEX recruitment_combined_roles_vacancy_unique
  ON recruitment.combined_roles (organization_id, lower(vacancy_code))
  WHERE vacancy_code IS NOT NULL AND btrim(vacancy_code) <> '';

CREATE TABLE recruitment.requirement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  template_code text NOT NULL,
  name text NOT NULL,
  combined_role_id uuid REFERENCES recruitment.combined_roles(id),
  department_id uuid REFERENCES recruitment.departments(id),
  designation_id uuid NOT NULL REFERENCES recruitment.designations(id),
  gender text,
  experience_requirement text,
  education text,
  minimum_salary numeric(14, 2),
  maximum_salary numeric(14, 2),
  role_responsibilities text,
  active boolean NOT NULL DEFAULT true,
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
  CHECK (
    minimum_salary IS NULL OR maximum_salary IS NULL
    OR maximum_salary >= minimum_salary
  )
);

CREATE UNIQUE INDEX recruitment_templates_code_unique
  ON recruitment.requirement_templates (organization_id, lower(template_code));

CREATE TABLE recruitment.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  department_id uuid NOT NULL REFERENCES recruitment.departments(id),
  designation_id uuid NOT NULL REFERENCES recruitment.designations(id),
  requirement_template_id uuid REFERENCES recruitment.requirement_templates(id),
  combined_role_id uuid REFERENCES recruitment.combined_roles(id),
  vacancy_number text NOT NULL,
  post_code text NOT NULL,
  vacancy_code text NOT NULL,
  gender text,
  experience_requirement text,
  education text,
  salary_range text,
  role_responsibilities text,
  employee_name text,
  employee_code text,
  status text NOT NULL DEFAULT 'Vacant'
    CHECK (status IN ('Vacant', 'Occupied', 'Inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE UNIQUE INDEX recruitment_posts_code_unique
  ON recruitment.posts (organization_id, lower(post_code));
CREATE INDEX recruitment_posts_status_idx
  ON recruitment.posts (organization_id, status, department_id);

CREATE TABLE recruitment.combined_role_posts (
  combined_role_id uuid NOT NULL
    REFERENCES recruitment.combined_roles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES recruitment.posts(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (combined_role_id, post_id)
);

CREATE UNIQUE INDEX recruitment_combined_role_primary_unique
  ON recruitment.combined_role_posts (combined_role_id)
  WHERE is_primary;

CREATE TABLE recruitment.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  current_company text,
  experience text,
  source text,
  preferred_department_id uuid REFERENCES recruitment.departments(id),
  resume_reference text,
  status text NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active', 'Hired', 'Inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE UNIQUE INDEX recruitment_candidates_phone_unique
  ON recruitment.candidates (organization_id, phone);
CREATE INDEX recruitment_candidates_search_idx
  ON recruitment.candidates (organization_id, lower(name), status);

CREATE TABLE recruitment.candidate_departments (
  candidate_id uuid NOT NULL
    REFERENCES recruitment.candidates(id) ON DELETE CASCADE,
  department_id uuid NOT NULL
    REFERENCES recruitment.departments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, department_id)
);

CREATE TABLE recruitment.job_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  post_id uuid REFERENCES recruitment.posts(id),
  requirement_template_id uuid REFERENCES recruitment.requirement_templates(id),
  job_number text NOT NULL,
  vacancy_code text NOT NULL,
  title text NOT NULL,
  post_date date NOT NULL DEFAULT current_date,
  target_date date,
  start_time time,
  end_time time,
  minimum_salary numeric(14, 2),
  maximum_salary numeric(14, 2),
  employee_count integer NOT NULL DEFAULT 1 CHECK (employee_count > 0),
  gender text,
  education text,
  experience_requirement text,
  description text,
  status text NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open', 'Closed', 'On Hold')),
  closed_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE UNIQUE INDEX recruitment_job_number_unique
  ON recruitment.job_posts (organization_id, lower(job_number));
CREATE INDEX recruitment_job_status_idx
  ON recruitment.job_posts (organization_id, status, target_date);

CREATE TABLE recruitment.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  candidate_id uuid NOT NULL REFERENCES recruitment.candidates(id),
  job_post_id uuid NOT NULL REFERENCES recruitment.job_posts(id),
  status text NOT NULL DEFAULT 'Assigned'
    CHECK (
      status IN (
        'Assigned', 'Interview', 'Approved', 'Rejected', 'Hold', 'Withdrawn'
      )
    ),
  interview_at timestamptz,
  planned_round text,
  joining_date date,
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
  UNIQUE (candidate_id, job_post_id)
);

CREATE INDEX recruitment_applications_schedule_idx
  ON recruitment.applications (organization_id, interview_at, status);

CREATE TABLE recruitment.candidate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  candidate_id uuid NOT NULL REFERENCES recruitment.candidates(id),
  job_post_id uuid REFERENCES recruitment.job_posts(id),
  application_id uuid REFERENCES recruitment.applications(id),
  event_type text NOT NULL,
  title text NOT NULL,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb,
  UNIQUE (source_system, source_table, source_id)
);

CREATE INDEX recruitment_candidate_events_timeline_idx
  ON recruitment.candidate_events (candidate_id, occurred_at DESC);

CREATE TABLE recruitment.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  application_id uuid NOT NULL REFERENCES recruitment.applications(id),
  round_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('Approved', 'Rejected', 'Hold')),
  interviewer_name text,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  comments text,
  joining_date date,
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
  UNIQUE (application_id, round_name)
);

CREATE INDEX recruitment_interviews_status_idx
  ON recruitment.interviews (organization_id, status, updated_at DESC);

REVOKE ALL ON SCHEMA recruitment FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA recruitment FROM PUBLIC;

GRANT USAGE, CREATE ON SCHEMA recruitment TO mrmpl_migration;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA recruitment TO mrmpl_migration;

GRANT USAGE ON SCHEMA recruitment TO mrmpl_web, mrmpl_worker, mrmpl_reporting;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA recruitment TO mrmpl_web;
GRANT SELECT ON ALL TABLES IN SCHEMA recruitment TO mrmpl_worker, mrmpl_reporting;

ALTER DEFAULT PRIVILEGES IN SCHEMA recruitment
  GRANT SELECT, INSERT, UPDATE ON TABLES TO mrmpl_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA recruitment
  GRANT SELECT ON TABLES TO mrmpl_worker, mrmpl_reporting;
