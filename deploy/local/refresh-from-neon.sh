#!/usr/bin/env bash
# Replaces the local `mrmpl` database with a fresh copy of Neon `staging`.
# Rehearsal/cutover only. Refuses to run once the local database is authoritative.
#
# Usage: bash deploy/local/refresh-from-neon.sh --replace-local-database
# Stop mrm-web/mrm-worker first; open connections to `mrmpl` are terminated.
set -euo pipefail

NEON_URL_FILE="${NEON_URL_FILE:-$HOME/.config/mrm-migration/neon-staging-owner.url}"
DUMP_ROOT="${DUMP_ROOT:-$HOME/.local/share/mrm-migration/dumps}"
AUTHORITATIVE_MARKER="$HOME/.config/mrm/local-authoritative"

if [[ "${1:-}" != "--replace-local-database" ]]; then
  echo "Destructive: pass --replace-local-database to confirm." >&2
  exit 1
fi
if [[ -e "$AUTHORITATIVE_MARKER" ]]; then
  echo "Refusing: $AUTHORITATIVE_MARKER exists (local database is the system of record)." >&2
  exit 1
fi

neon_url="$(cat "$NEON_URL_FILE")"
dump="$DUMP_ROOT/staging-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DUMP_ROOT"

echo "Dumping Neon staging -> $dump"
pg_dump -d "$neon_url" -Fd -j 4 -Z zstd:3 --no-tablespaces -f "$dump"

# Neon-internal default privileges reference roles that do not exist locally.
pg_restore -l "$dump" | grep -v "cloud_admin" > "$dump.restore.list"

echo "Recreating local database mrmpl"
psql -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'mrmpl' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS mrmpl;
CREATE DATABASE mrmpl OWNER neondb_owner;
GRANT CREATE ON DATABASE mrmpl TO mrmpl_staging_migration;
SQL

echo "Restoring"
pg_restore -d mrmpl -j 12 --exit-on-error --no-tablespaces -L "$dump.restore.list" "$dump"
vacuumdb -d mrmpl --analyze-in-stages -j 8 --quiet

echo "Verifying exact row counts against Neon"
count_sql="
select n.nspname||'.'||c.relname||'|'||
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%'
order by 1"
if diff <(psql "$neon_url" -tAc "$count_sql") <(psql -d mrmpl -tAc "$count_sql") > "$dump.count.diff"; then
  echo "OK: $(psql -d mrmpl -tAc "$count_sql" | wc -l) tables match Neon exactly."
else
  echo "Row counts differ (Neon may have taken writes during the dump). See $dump.count.diff" >&2
  exit 2
fi
