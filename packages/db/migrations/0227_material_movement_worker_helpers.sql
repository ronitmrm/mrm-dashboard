GRANT USAGE ON SCHEMA migration TO mrmpl_worker;
GRANT EXECUTE ON FUNCTION migration.try_date(text), migration.try_numeric(text)
  TO mrmpl_worker;
