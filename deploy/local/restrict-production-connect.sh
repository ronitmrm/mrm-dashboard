#!/usr/bin/env bash
# Only application roles may connect to the production `mrmpl` database.
set -euo pipefail

psql -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
REVOKE CONNECT, TEMPORARY ON DATABASE mrmpl FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE mrmpl TO mrmpl_web, mrmpl_worker, mrmpl_migration, mrmpl_reporting, neondb_owner;
SQL
