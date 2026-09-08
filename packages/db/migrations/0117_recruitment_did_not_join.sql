ALTER TABLE recruitment.applications
  ADD COLUMN did_not_join_on date,
  ADD COLUMN did_not_join_reason text,
  ADD CONSTRAINT applications_did_not_join_details_check CHECK (
    status <> 'Did Not Join' OR (
      did_not_join_on IS NOT NULL
      AND did_not_join_reason IS NOT NULL
      AND btrim(did_not_join_reason) <> ''
    )
  );

ALTER TABLE recruitment.applications
  DROP CONSTRAINT applications_status_check;

ALTER TABLE recruitment.applications
  ADD CONSTRAINT applications_status_check CHECK (
    status IN (
      'Assigned', 'Interview', 'Approved', 'Rejected', 'Hold', 'Withdrawn',
      'Did Not Join'
    )
  );
