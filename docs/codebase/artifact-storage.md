# Artifact storage architecture

This page describes the current UploadThing application path and the implemented
private GCS provider foundation. Application delivery, data migration, and live
cutover remain pending under the approved
[private GCS target](../specs/private-google-cloud-artifacts.md).

Runtime Artifact metadata is canonical in PostgreSQL. `core.file_objects`
represents Organization-scoped physical provider objects; `core.files`
represents immutable logical Artifacts; `core.file_links` versions their
business-record usages. The Administration ledger queries PostgreSQL, not
UploadThing file listings, and sums unique live physical bytes without
double-counting logical references.

`packages/db/src/artifacts.ts` owns hashing, Organization-scoped deduplication,
idempotency, version replacement, link lifecycle, transactions, and manual
deletion state. `apps/web/lib/uploadthing-artifact-provider.ts` is the narrow
server-only provider boundary for upload and final-reference deletion. Missing
or invalid `UPLOADTHING_TOKEN` fails new storage; it never falls back to local
writes.

`apps/web/lib/google-cloud-artifact-provider.ts` implements the private target
with `@google-cloud/storage` 8.1.0. It validates configuration, uses local
Application Default Credentials or request-lazy Vercel OIDC federation, derives
opaque deterministic keys, prevents overwrite, verifies exact bytes after
upload, reads exact bytes, and fences deletion to the observed object
generation. PostgreSQL accepts `google-cloud-storage` rows with a nullable
transitional public URL. The application still constructs UploadThing for its
business actions until the later delivery and upload slices switch them.

The user-created target is Google Cloud project
`project-b3e69f72-3e13-4f13-98b` and bucket `mrm-erp-gcp-1`; runtime code has no
hard-coded defaults. The project number, pool ID, provider ID, service-account
email, and verified Vercel production/staging claims remain external setup
blockers. Environment names are `GCS_PROJECT_ID`, `GCS_BUCKET_NAME`,
`GCS_PROJECT_NUMBER`, `GCS_WORKLOAD_IDENTITY_POOL_ID`,
`GCS_WORKLOAD_IDENTITY_PROVIDER_ID`, and `GCS_SERVICE_ACCOUNT_EMAIL`.

Retained Commercial, Recruitment, Store, and enquiry-line import actions call
the shared service. Quote, PI, and Store Purchase Order issuance calls the same
service before exposing the issued state. All other reports, exports, templates,
draft previews, and transient imports remain generated or parsed on demand.

Established download routes redirect current Artifact-backed records to their
UploadThing public URL and return explicit unavailable responses for tombstones.
Rows without a physical-object reference may use
`apps/web/lib/user-attachment-storage.ts`, whose only exported operation is a
contained read below `LOCAL_FILE_STORAGE_PATH`. It cannot create, replace, or
delete local bytes.

Deployment requires PostgreSQL migrations through the Artifact ledger and
manual-deletion migrations plus a server-only `UPLOADTHING_TOKEN`. The
UploadThing app uses `public-read`; app authorization governs discovery but not
possession of a disclosed URL. The current free-tier planning assumption is
2 GB storage with unlimited uploads/downloads. Capacity reporting is advisory;
the application does not change plans or delete objects automatically.
