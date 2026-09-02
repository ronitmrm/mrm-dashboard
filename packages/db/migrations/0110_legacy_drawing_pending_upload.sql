ALTER TABLE catalog.drawing_revisions
  DROP CONSTRAINT drawing_revisions_check2;

ALTER TABLE catalog.drawing_revisions
  ADD CONSTRAINT drawing_revisions_released_file_check CHECK (
    status NOT IN ('Released', 'Superseded')
    OR requirement_status = 'Not Required'
    OR file_id IS NOT NULL
  );
