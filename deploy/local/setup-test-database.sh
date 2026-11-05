#!/usr/bin/env bash
# Points the repo's test suite at the local Postgres/Redis without touching production data.
# - mrmpl_test owned by a non-superuser test login (CREATEDB only; tests create throwaway DBs)
# - extensions pre-installed in template1 (pg_stat_statements needs a superuser to create)
# - production `mrmpl` no longer accepts CONNECT from PUBLIC
# - tests use Redis logical DB 15
# Writes ~/.config/mrm/test.env (0600).
# Run: bash deploy/local/setup-test-database.sh
set -euo pipefail
umask 077

env_file="$HOME/.config/mrm/test.env"
password="$(sed -n 's/^TEST_DATABASE_PASSWORD=//p' "$env_file" 2>/dev/null || true)"
password="${password:-$(openssl rand -hex 24)}"

psql -d template1 -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL

psql -d postgres -v ON_ERROR_STOP=1 -q -v pw="$password" <<'SQL'
SELECT 'CREATE ROLE mrmpl_test_runner' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mrmpl_test_runner') \gexec
ALTER ROLE mrmpl_test_runner LOGIN CREATEDB NOSUPERUSER NOCREATEROLE PASSWORD :'pw';
SELECT 'CREATE DATABASE mrmpl_test OWNER mrmpl_test_runner' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'mrmpl_test') \gexec
SQL

bash "$(dirname "$0")/restrict-production-connect.sh"

cat > "$env_file" <<EOF
TEST_DATABASE_PASSWORD=$password
TEST_DATABASE_URL=postgresql://mrmpl_test_runner:$password@127.0.0.1:5432/mrmpl_test
TEST_REDIS_URL=redis://127.0.0.1:6379/15
EOF

echo "Test database ready. Load it before running tests:"
echo "  set -a; . ~/.config/mrm/test.env; set +a"
