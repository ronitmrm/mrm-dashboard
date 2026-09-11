# Artifact storage architecture

This page describes the current UploadThing write path, private GCS provider,
and provider-independent private delivery path. Browser upload transport, data
migration, and live cutover remain pending under the approved
[private GCS target](../specs/private-google-cloud-artifacts.md).

Runtime Artifact metadata is canonical in PostgreSQL. `core.file_objects`
represents Organization-scoped physical provider objects; `core.files`
represents immutable logical Artifacts; `core.file_links` versions their
business-record usages. The Administration ledger queries PostgreSQL, not
provider listings, and sums unique live physical bytes without double-counting
logical references.

`packages/db/src/artifacts.ts` owns hashing, Organization-scoped deduplication,
idempotency, version replacement, link lifecycle, transactions, and manual
deletion state. `apps/web/lib/artifact-storage-providers.ts` lazily dispatches
the stored provider for read/delete/upload, so an UploadThing row does not
require GCS configuration and vice versa. The wrapper preserves GCS rollback
safety and the UploadThing legacy URL resolver. Missing provider configuration
fails closed; it never falls back to another provider or to local writes.

`apps/web/lib/google-cloud-artifact-provider.ts` implements the private target
with `@google-cloud/storage` 8.1.0. It validates configuration, uses local
Application Default Credentials or request-lazy Vercel OIDC federation, derives
opaque deterministic keys, prevents overwrite, verifies exact bytes after
upload, reads exact bytes, and fences deletion to the observed object
generation. PostgreSQL accepts `google-cloud-storage` rows with a nullable
transitional public URL. Business actions still write through UploadThing until
the later upload slice switches them.

The user-created target is Google Cloud project
`project-b3e69f72-3e13-4f13-98b`, numeric project `185282230283`, and bucket
`mrm-erp-gcp-1`; runtime code has no hard-coded defaults. Vercel project
`mrm-general/mrm-dashboard` has production only; GitHub staging has no deployed
preview/staging environment. No local ADC is available. Production-only
federation, bucket IAM/settings, and Vercel environment variables are configured
and inspected; actual application token exchange and traffic remain unverified.
See [GCS configuration](./google-cloud-artifacts-setup.md). Environment names are
`GCS_PROJECT_ID`, `GCS_BUCKET_NAME`,
`GCS_PROJECT_NUMBER`, `GCS_WORKLOAD_IDENTITY_POOL_ID`,
`GCS_WORKLOAD_IDENTITY_PROVIDER_ID`, and `GCS_SERVICE_ACCOUNT_EMAIL`.

Retained Commercial, Recruitment, Store, and enquiry-line import actions call
the shared service. Quote, PI, and Store Purchase Order issuance calls the same
service before exposing the issued state. All other reports, exports, templates,
draft previews, and transient imports remain generated or parsed on demand.

`apps/web/lib/artifact-delivery.ts` is the single retained-byte read and HTTP
response path. Authorization, Organization, ownership, and target selection
remain in each route/repository before any provider read. Physical bytes are
fully buffered and checked against the physical object's exact byte size and
SHA-256 before a response stream yields bytes. Responses preserve known-safe
PDF, PNG/JPEG, XLSX, and ZIP types, safe inline/download disposition, exact
content length, `private, no-store`, nosniff, and the private document security
headers. Range requests are not implemented.

Commercial drawings/orders/issued Quote and PI documents, Recruitment resumes,
Store documents/issued POs, Administration ledger content, and Maintenance
photos now use authenticated application routes. Quote ZIP assembly shares the
verified byte reader, omits only missing entries, and propagates provider or
integrity failures rather than returning a partial archive. Ledger presentation
returns logical content paths and friendly provider labels, never provider URLs
or keys.

Historical rows use `apps/web/lib/user-attachment-storage.ts` only when
`physical_object_id` is absent. Nullable legacy size/SHA metadata stays unknown;
when both values exist the local bytes are verified. A null legacy public URL is
not a local-storage signal. The local reader is contained below
`LOCAL_FILE_STORAGE_PATH` and cannot create, replace, or delete bytes.

Deployment requires PostgreSQL migrations through the Artifact ledger and
manual-deletion migrations plus current server-only provider configuration.
UploadThing remains `public-read` during transition, but its URL is resolved and
read only on the server. The ledger's current advisory allowance is 5 GB-months.
Capacity reporting is advisory; the application does not change plans or delete
objects automatically.
