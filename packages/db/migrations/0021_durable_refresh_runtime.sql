-- Durable refresh attempts and retry-safe outbox claims for the local worker.

ALTER TABLE derived.refresh_jobs
  ADD COLUMN started_at timestamptz,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN last_duration_ms bigint
    CHECK (last_duration_ms IS NULL OR last_duration_ms >= 0),
  ADD COLUMN last_model_version bigint
    CHECK (last_model_version IS NULL OR last_model_version > 0);

CREATE TABLE derived.refresh_job_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  refresh_job_id uuid NOT NULL REFERENCES derived.refresh_jobs(id) ON DELETE CASCADE,
  attempt integer NOT NULL CHECK (attempt > 0),
  worker_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms bigint CHECK (duration_ms IS NULL OR duration_ms >= 0),
  model_version bigint CHECK (model_version IS NULL OR model_version > 0),
  error text,
  UNIQUE (refresh_job_id, attempt)
);

CREATE INDEX refresh_job_attempts_org_time_idx
  ON derived.refresh_job_attempts (organization_id, started_at DESC);

ALTER TABLE derived.outbox_events
  ADD COLUMN locked_at timestamptz,
  ADD COLUMN locked_by text;

CREATE INDEX outbox_events_retry_claim_idx
  ON derived.outbox_events (available_at, occurred_at)
  WHERE published_at IS NULL;
