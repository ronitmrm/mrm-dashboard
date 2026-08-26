# Artifact storage architecture

Runtime Artifact metadata is canonical in PostgreSQL. `core.file_objects`
represents Organization-scoped physical UploadThing objects; `core.files`
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
