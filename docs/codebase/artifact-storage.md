# Artifact storage architecture

This page describes the private GCS runtime, authenticated delivery, and the
pending-upload transport. Browser form wiring and guarded migration tooling are
implemented locally. Production migration, deployment acceptance, and live
cutover remain pending under the approved
[private GCS target](../specs/private-google-cloud-artifacts.md).

Runtime Artifact metadata is canonical in PostgreSQL. `core.file_objects`
represents Organization-scoped physical provider objects; `core.files`
represents immutable logical Artifacts; `core.file_links` versions their
business-record usages. The Administration ledger queries PostgreSQL, not
provider listings, and sums unique live physical bytes without double-counting
logical references.

`packages/db/src/artifacts.ts` owns hashing, Organization-scoped deduplication,
idempotency, version replacement, link lifecycle, transactions, and manual
deletion state. `apps/web/lib/artifact-storage-providers.ts` now exposes only
private GCS. Historical `uploadthing` provider identifiers remain valid ledger
and migration evidence, but the application runtime refuses those locators; it
has no UploadThing SDK, token, read, or delete adapter. Therefore every live
historical object must be migrated before this GCS-only application is deployed.
Missing or historical provider configuration fails closed; it never falls back
to another provider or to local writes.

`apps/web/lib/google-cloud-artifact-provider.ts` implements the private target
with `@google-cloud/storage` 8.1.0. It validates configuration, uses request-lazy
Vercel OIDC federation, derives opaque deterministic retained keys, prevents
overwrite, verifies exact bytes after upload, reads exact bytes, and fences
deletion to the observed object generation. PostgreSQL accepts
`google-cloud-storage` rows with a nullable transitional public URL. Operator
scripts inject a short-lived gcloud CLI OAuth client; they do not require ADC or
change the web runtime authentication mode. Local web processes instead select
the same lazy Vercel OIDC/custom-audience path when `VERCEL_OIDC_TOKEN` is
present; they do not set `VERCEL=1` or use gcloud. Refresh local credentials from
`apps/web` with `pnpm artifact:auth:refresh` and restart the dev server.

`core.pending_artifact_uploads` durably owns each authenticated browser upload.
It records a random upload ID, owner, Organization, normalized workflow intent,
declared metadata, expected size, server-only temporary key/session, confirmed
offset, expiry, computed completion metadata, final logical Artifact binding,
and retryable cleanup state. Temporary objects live only below
`pending-artifact-uploads/`; retained objects live below `artifacts/`.

The browser-safe contract is in `apps/web/lib/artifact-upload-contract.ts`:

- `POST /api/artifact-uploads` starts `{ intent, fileName, mediaType, byteSize }`.
- `GET /api/artifact-uploads/[uploadId]` returns safe progress.
- `PUT /api/artifact-uploads/[uploadId]` sends one raw chunk with
  `Upload-Offset`; chunks are sequential and at most 4 MiB.
- `POST /api/artifact-uploads/[uploadId]/complete` verifies the temporary bytes
  and marks them ready.
- `DELETE /api/artifact-uploads/[uploadId]` abandons and cancels the upload.

Responses expose only `{ uploadId, confirmedOffset, state }`, where state is
`uploading`, `ready`, `finalized`, or `abandoned`. The GCS key, resumable-session
URI, tokens, hashes, and provider errors stay server-only. Final forms use
`${field}_upload_id`; repeated Maintenance photos repeat that field. Retained
server actions are upload-ID-only and centrally reject nonempty raw `File`
submissions.

Finalization reauthorizes the original workflow target before provider access,
then stores the verified bytes through the original Artifact authorization and
idempotency seam. The ready-to-finalized binding is committed in the same
PostgreSQL transaction as the retained Artifact. Exact finalized retries reuse
the originally bound logical ID, target, and purpose, including the Artifact's
existing superseded/tombstoned metadata behavior.

The user-created target is Google Cloud project
`project-b3e69f72-3e13-4f13-98b`, numeric project `185282230283`, and bucket
`mrm-erp-gcp-1`; runtime code has no hard-coded defaults. Vercel project
`mrm-general/mrm-dashboard` has production only; GitHub staging has no deployed
preview/staging environment. No local ADC is available. Federation accepts only
the exact Production and Development subjects; bucket IAM/settings and the
Production and Development Vercel environments are configured and inspected. A
real Development-token provider probe passed exact synthetic write/read,
anonymous 403, deletion, and confirmed absence without gcloud, ADC, or an
injected client. Vercel Production is confirmed to use Neon project
`steep-mouse-42175009`, branch `br-polished-voice-axsmr68e` (`staging`),
database `neondb`; deployed application exchange and browser traffic remain
unverified.
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
manual-deletion/pending-upload migrations plus current server-only provider
configuration. Run bounded temporary cleanup explicitly with
`pnpm --filter web artifact:uploads:cleanup -- --limit=100`. The command applies
cleanup to at most that many eligible rows; valid limits are 1 through 500.
Cleanup uses the operator gcloud login, serializes against upload operations,
retries failed finalized-object cleanup, and is restricted to the temporary
namespace. It does not delete retained Artifacts or ledger rows.
The current deployed application and unmigrated historical sources remain on
UploadThing until the coordinated cutover. The GCS-only runtime must not be
deployed first: it cannot deliver or delete those historical locators. The
ledger's current advisory allowance is 5 GB-months. Capacity reporting is
advisory; the application does not change plans or delete objects automatically.

Operator/provider acceptance on 2026-09-11 passed against the real bucket: a
25 MiB temporary upload completed in seven chunks of at most 4 MiB with
confirmed-offset recovery, generation-bound exact read, terminal cancellation,
and cleanup of every synthetic object/session. This proves the server provider
protocol using operator OAuth only. It does not prove browser integration,
deployed Vercel WIF, or production application traffic.
