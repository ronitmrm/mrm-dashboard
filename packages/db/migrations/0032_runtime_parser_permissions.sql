-- Runtime repositories use the tolerant date parsers while writing normalized
-- operational records. Schema lookup is required in addition to function
-- execution, but migration evidence tables remain inaccessible to the web role.

GRANT USAGE ON SCHEMA migration TO mrmpl_web;

REVOKE EXECUTE ON FUNCTION migration.try_numeric(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION migration.try_date(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION migration.try_timestamptz(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION migration.try_numeric(text) TO mrmpl_migration;
GRANT EXECUTE ON FUNCTION migration.try_date(text)
  TO mrmpl_migration, mrmpl_web;
GRANT EXECUTE ON FUNCTION migration.try_timestamptz(text)
  TO mrmpl_migration, mrmpl_web;

DO $$
BEGIN
  IF NOT has_schema_privilege('mrmpl_web', 'migration', 'USAGE') THEN
    RAISE EXCEPTION
      'mrmpl_web must have USAGE on migration for runtime parser functions';
  END IF;
END;
$$;
