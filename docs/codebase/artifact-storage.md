# Artifact storage architecture

PostgreSQL is canonical for Artifact identity, ownership, metadata, business
links, lifecycle, and deletion evidence. Private Google Cloud Storage contains
bytes only. The application never exposes provider URLs, keys, resumable
sessions, or credentials.

## Retained artifacts

`packages/db/src/artifacts.ts` owns Organization-scoped deduplication,
idempotency, version replacement, link lifecycle, transactions, and manual
deletion state:

- `core.file_objects` represents physical provider objects.
- `core.files` represents immutable logical Artifacts.
- `core.file_links` versions business-record usages.

`apps/web/lib/google-cloud-artifact-provider.ts` is the only writable provider.
It uses Vercel OIDC, opaque deterministic object keys, create-only writes, exact
byte verification, and generation-fenced deletion.

`apps/web/lib/artifact-delivery.ts` is the shared retained-byte read path.
Routes authorize the actor, Organization, and business target before reading.
The delivery layer verifies stored size and SHA-256, restricts media types, and
returns private, no-store responses.

## Pending uploads

`core.pending_artifact_uploads` owns temporary browser uploads. A row binds a
random upload ID to its actor, Organization, workflow intent, declared metadata,
expected size, provider session, confirmed offset, expiry, and final Artifact.

The HTTP contract is:

- `POST /api/artifact-uploads` starts an upload.
- `GET /api/artifact-uploads/[uploadId]` returns safe progress.
- `PUT /api/artifact-uploads/[uploadId]` appends one sequential chunk of at
  most 4 MiB.
- `POST /api/artifact-uploads/[uploadId]/complete` verifies temporary bytes.
- `DELETE /api/artifact-uploads/[uploadId]` abandons the upload.

Finalization reauthorizes the original target and commits the ready upload's
Artifact binding in the same PostgreSQL transaction as the business write.
Exact retries reuse that binding.

Temporary cleanup is explicit and bounded:

```bash
pnpm --filter web artifact:uploads:cleanup -- --limit=100
```

The command only operates on temporary uploads. It cannot delete retained
Artifacts or ledger rows.

## Legacy compatibility and cutover

Historical `uploadthing` locators remain migration evidence, but the runtime
has no UploadThing adapter. Historical local rows are read-only through
`apps/web/lib/user-attachment-storage.ts`; no runtime path creates or deletes
local bytes.

Do not deploy the GCS-only runtime while live historical locators still depend
on another provider. Use [the migration runbook](./artifact-storage-migration.md)
for inventory, migration, reconciliation, rollback, and contract-removal gates.
Provider configuration is documented in
[Google Cloud Artifact configuration](./google-cloud-artifacts-setup.md).
