# Unified PostgreSQL Foundation

Date: 2026-07-18

Status: Accepted

## Context

MRMPL Dashboard and Pricing used separate Convex and SQLite persistence. The
unified application requires one durable business datastore without a second
application shell or compatibility runtime.

## Decision

- `mrm-dashboard` is the canonical repository and `apps/web` remains the only
  web application.
- PostgreSQL 16 or newer is the sole target business datastore.
- PostgreSQL schemas separate `identity`, `core`, `catalog`, `sales`,
  `manufacturing`, `workforce`, `quality`, `maintenance`, `audit`, `derived`,
  and `migration`.
- `packages/db` owns the Drizzle schema, the lazy `node-postgres` pool,
  transaction boundaries, and checked-in numbered SQL migrations.
- `packages/migration` owns source artifact inventory, extraction, staging,
  transformation, source-ID mapping, conflict queues, and reconciliation. It
  is not imported by production request handlers.
- `packages/runtime` owns durable read-model, outbox, and reconciliation jobs. Web
  requests may enqueue work in the same PostgreSQL transaction as a canonical
  write but do not run unbounded rebuilds inline.
- Application-generated UUIDs are used for canonical identities. Imported
  rows retain immutable source provenance.
- PostgreSQL `numeric` values cross the database boundary as decimal strings.
  Domain calculation code must convert explicitly and must not rely on
  JavaScript floating-point storage for money or rates.
- Complex reports, bulk loading, locking, and queue claims may use
  parameterized handwritten SQL behind typed package interfaces.
- Database clients are initialized lazily so `next build`, tests, and tooling
  can import modules without requiring runtime secrets.
- Development uses an isolated PostgreSQL container and explicit per-package
  environment files. No command silently selects a cloud database.

## Consequences

- The high-fan-in Pricing `getDb()` SQLite boundary cannot remain as a runtime
  compatibility layer. Pricing workflows are ported vertically to async,
  typed PostgreSQL repositories.
- Convex stays readable only as an immutable migration source until cutover.
  New runtime features must not deepen the Convex dependency.
- The temporary dashboard JSONB read model is a compatibility bridge. Direct
  screens should move to normalized queries as their vertical slice is
  migrated.
- Provider and region selection remain deployment decisions; the database
  package stays standard PostgreSQL and provider-neutral.
