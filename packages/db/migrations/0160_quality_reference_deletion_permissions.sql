-- These tables may have been created by a different migration role than the
-- existing SECURITY DEFINER function. Grant its owner only what deletion needs;
-- application roles continue to use the allowlisted, organization-scoped function.
DO $$
DECLARE
  deletion_owner name;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO STRICT deletion_owner
  FROM pg_proc
  WHERE oid = 'core.delete_master_record(text,text,uuid,uuid)'::regprocedure;

  EXECUTE format(
    'GRANT SELECT, DELETE ON quality.parameter_names, quality.measuring_instruments TO %I',
    deletion_owner
  );
END;
$$;
