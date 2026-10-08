-- Source projection triggers run as their existing SECURITY DEFINER owner.
-- A later migration may use a different role, so grant that owner explicitly.
DO $$
DECLARE
  source_trigger_owner name;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO STRICT source_trigger_owner
  FROM pg_proc
  WHERE oid = 'derived.sync_dashboard_source_record()'::regprocedure;

  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE ON derived.dashboard_source_revisions TO %I',
    source_trigger_owner
  );
END;
$$;
