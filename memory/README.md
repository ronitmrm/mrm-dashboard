# Agent Memory

Persistent notes for local coding agents. Treat these as context, not authority; verify important claims against the codebase.

- `convex-local.md` - local self-hosted Convex development workflow and caveats.
- `convex-cloud-migration.md` - current cloud Convex deployment migration and auth setup notes.
- `planning-rules.md` - production planning date-cascade rules and no-production actual caveats.
- `production-card-rules.md` - role production-card date/edit/keying rules.
- `maintenance-rules.md` - planned machine maintenance schedule and task-entry rules.
- `quality-rules.md` - shared first-piece and hourly quality parameter master rules.
- `master-data-rules.md` - master data browsing and data-entry separation rules.
- `convex-static-schema-audit.md` - source-only physical/logical schema and
  dashboard data-flow findings for the PostgreSQL migration specification.
- `postgresql-migration-spec.md` - approved target architecture, mappings,
  migration phases, cutover, and rollback decisions for Convex and SQLite.
- Runtime ADRs:
  `docs/adr/0005-unified-postgresql-foundation.md` and
  `docs/adr/0006-better-auth-redis-runtime.md`.
- Agent workflow: if the command approval layer times out, retry the command once before treating it as blocked or asking the user.
