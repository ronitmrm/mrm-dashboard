-- pg_stat_statements is preloaded by the local PostgreSQL service and is also
-- supported by the managed PostgreSQL target. PostgreSQL remains operational if
-- statistics are reset; this extension stores no canonical application data.

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
