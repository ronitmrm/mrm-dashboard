-- Preserve the scheduled date and state of every interview round.

ALTER TABLE recruitment.interviews
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

UPDATE recruitment.interviews interview
SET scheduled_at = application.interview_at
FROM recruitment.applications application
WHERE application.id = interview.application_id
  AND interview.scheduled_at IS NULL;

ALTER TABLE recruitment.interviews
  DROP CONSTRAINT IF EXISTS interviews_status_check;

ALTER TABLE recruitment.interviews
  ADD CONSTRAINT interviews_status_check
  CHECK (status IN ('Scheduled', 'Approved', 'Rejected', 'Hold'));
