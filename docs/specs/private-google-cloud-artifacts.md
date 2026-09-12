# Private Google Cloud Storage Artifacts

Status: Provider, private delivery, pending-upload transport and forms, and
controlled migration tooling are implemented locally. Retained submissions are
upload-ID-only, and the local runtime/package set is GCS-only. Production cloud
configuration is saved and all 36 available UploadThing files have verified GCS
copies; deployment, live locator migration, application acceptance, and
destructive database-column contraction have not started.
Date: 2026-09-09.
Revalidated: 2026-09-11 against staging `2bf5572` after rebase.
Source: [GitHub issue #88](https://github.com/ronitmrm/mrm-dashboard/issues/88).

This records decisions that clarify or amend #88. The issue remains the full
delivery specification; this document does not claim the migration is deployed.

## Accepted decisions

- Preserve the existing larger-upload allowances, including 25 MiB Commercial
  drawings. The user rejected reducing submissions to a 4 MB file budget.
  Expand #88 to include the upload transport needed to support these limits on
  Vercel.
- Cut over on a holiday with zero active users, as specified by the user.
  Continuous Artifact availability is not required. Coordinate all deployments
  and commands sharing PostgreSQL before mutation; the quiet window does not
  remove checksum, recovery, or reconciliation requirements.
- Keep downloads behind application session, capability, and Organization
  checks. A transport change for uploads does not authorize public or signed
  download URLs.

## Selected engineering defaults

- All retained browser uploads use one shared pending-upload transport. Send
  sequential raw chunks of at most 4 MiB to authenticated application routes;
  the server forwards them into one private GCS resumable session. Small files
  need one chunk. Business submissions carry upload IDs instead of file bytes,
  so multiple files cannot overflow a single Vercel request.
- Keep the provider session URI server-only. Bind the pending upload to its
  user, Organization, intended purpose/target, expected size, and expiry;
  authorize each chunk and the final business action. Retry by confirmed offset.
  Enforce each workflow's existing file limits server-side.
- Verify completed temporary bytes server-side: exact size, SHA-256, existing
  media/content validation, and current target authorization before committing
  a retained Artifact. Do not trust client hashes or object metadata alone.
  Preserve Organization deduplication and deterministic immutable final keys.
- Cancel incomplete sessions and clean up expired, rejected, or abandoned
  temporary uploads. Cleanup may never delete retained objects. Generated
  business documents keep their existing server-side Buffer path.
- Application-mediated resumable uploads are in scope. Keep the prohibition
  on browser provider URLs, signing permissions, and bucket
  CORS configuration. No compose-based chunk-object system is needed.
- Vercel limits request payloads to 4.5 MB. Increasing Next.js body limits does
  not remove that hosting limit. Stream authenticated download responses to
  preserve larger existing files; verify bytes before starting delivery and
  retain the issue's no-range-request scope.
- Copy, verify, and atomically commit the GCS locator and pending source-cleanup
  record. The application and migration CLI remain UploadThing-token-free;
  remove each committed old source through separately authorized operator
  tooling or the UploadThing dashboard. Record completion only when the exact
  old URL returns 404/410; ambiguity keeps migration incomplete.
- Deterministic object reuse makes the current unconditional rollback cleanup
  unsafe: a failed transaction can delete an object another operation reused.
  Verified uploaded bytes must remain safely reusable after a database failure;
  cleanup must respect committed references, fingerprint locks, and object
  generations. Decide the narrow implementation during coding.
- Every deployment or command sharing PostgreSQL must understand GCS before
  any shared locator switches. The user clarified on 2026-09-11 that only
  production is hosted; GitHub staging has no deployed preview environment.
  Remove compatibility only after source cleanup and acceptance complete.
  Keep expand/migrate/contract as controlled holiday cutover stages; do not
  build continuous-availability machinery.
- Historical local reads apply only when a logical file has no physical object;
  clearing a provider URL must never trigger local fallback.
- Include existing Artifact consumers found in code, including Maintenance
  photos; preserve their current permissions and workflows even where the
  issue's route examples do not enumerate them.
- Migration tooling defaults to database-only inventory. Mutating modes require
  an explicit paused-writer acknowledgement. A durable per-object cleanup row
  keeps the verified locator commit separate from retryable source deletion;
  completion requires the exact recorded legacy HTTPS URL to return 404/410.
  See the [operator runbook](../codebase/artifact-storage-migration.md).

## Delivery scope added by staging

The rebase adds consumers and existing behaviors to preserve, without changing
the accepted storage architecture or the holiday cutover decision.

- **Quotation history:** preserve enquiry-wide Revision 00 onwards, explicit
  `revision` selection, and `draft=true` behavior. Issued versions retain their
  exact PDF Artifact; storage migration must not replace a requested historical
  version with today's PDF or a regenerated draft.
- **Pinned customer drawings:** preserve Design's explicit file selection and
  the approved portfolio-drawing fallback. An explicit selection suppresses
  fallback even when selected files become unavailable. Sent quotation line
  snapshots pin logical `customerDrawingFileIds`; migrate their physical
  locators without changing those IDs or substituting newer drawings. Legacy
  quotations without captured attachments remain without attachments. These
  rules already belong to the [Design glossary](../glossary/design-bom-ecn.md).
- **Per-part and ZIP downloads:** include both
  `/commercial/quotes/enquiry/[id]/drawings/[fileId]` and
  `/commercial/quotes/enquiry/[id]/drawings/download`. Preserve quotation
  capability, salesperson/Administrative scope, Organization authorization,
  and selected-revision file membership before accessing bytes. ZIP delivery
  preserves its existing line-based filenames and omission of unavailable
  entries; an empty collection remains unavailable. The archive is a transient
  export, not a new retained Artifact.
- **Provider reads behind ZIP assembly:** update `QuoteDrawing`,
  `availableQuoteDrawingFiles`, and `readQuoteDrawing` alongside the individual
  response routes. They currently depend on `publicUrl` and `storageKey`.
  Reuse the verified private-byte read underneath the HTTP response helper for
  ZIP assembly; do not introduce another URL-fetch path. Local fallback still
  requires absence of a physical object. Send only logical IDs, application
  links, and presentation metadata to UI consumers.
- **Aggregate response size:** the archive can exceed the response limit even
  when each drawing is small. Apply authenticated streamed delivery to ZIPs as
  well as individual files, without reducing the existing download-all scope.
- **Multipage PDF preview:** preserve the shared `PdfPreview`/React-PDF viewer,
  locally bundled PDF.js worker, pagination, zoom, and Download Original action.
  Keep application content URLs and the established private-document security
  headers. Verify preview with the accepted full-response/no-range design;
  do not regress to iframe or browser-plugin-only rendering. Follow the
  [golden UI pattern](../codebase/ui-golden-patterns.md).
- **Existing PDF proxy baseline:** before this work, the quotation PDF route
  fetched retained UploadThing bytes server-side. The implemented route now uses
  the shared private reader; redirect-only discovery would have missed it.

## Acceptance additions to #88

- Prove a permitted 25 MiB upload succeeds on Vercel through bounded requests,
  returns exact bytes through authenticated download, and retains the existing
  invalid-size/content rejection behavior.
- Prove chunk retry does not duplicate or overwrite retained evidence and
  unauthorized/expired upload sessions cannot advance or finalize. Keep tests
  focused on the shared transport and existing business authorization seams.
- Prove temporary-upload cleanup cannot touch a retained object. This is not
  a new automatic retention/deletion policy for Artifacts.
- Extend the existing quote-drawing integration and ZIP tests to prove an
  issued version still reads the pinned file after migration and a later
  drawing release. Preserve legacy-empty and unavailable-selection behavior.
  Verify authorization before reads for both individual and archive access.
- Exercise a ZIP larger than 4.5 MB and a multipage retained PDF in the deployed
  application: archive contents, historical selection, page navigation, zoom,
  and Download Original must work through authenticated application URLs.
  Reuse existing seams and browser checks instead of adding a test per route.

## Verification still needed

- Vercel Production is confirmed to use Neon project
  `steep-mouse-42175009`, branch `br-polished-voice-axsmr68e` (`staging`),
  database `neondb`. Read-only preflight reports 38 live UploadThing physical
  objects (7,419,132 bytes) and 51 logical files (48 current, 3 superseded).
  Thirty-six source objects (7,419,078 bytes) fetched and matched exactly. Root's
  separately authorized one-off copy placed those 36 exact objects in private
  GCS, verified every readback and object count, and confirmed anonymous access
  returns 403 without changing source objects or database rows. Database
  locators still name UploadThing. Two current 27-byte business-drawing records
  have invalid `example.test`
  source URLs and no matching UploadThing object; their recorded payloads can be
  recovered from repository evidence, but the full original PDFs are absent.
  The user identified these drawings as stale and waived recovery on 2026-09-12,
  approving the PR merge into `staging`. Their database records remain intact;
  the separate Production cutover must account for them. Production also lacks
  0138 and 0139.
- Production project identity, team issuer configuration, exact subject trust,
  bucket permissions/settings, and six production environment variables are
  now configured and inspected; see [GCS setup](../codebase/google-cloud-artifacts-setup.md).
  Actual runtime token exchange and real Artifact traffic remain unverified.
  No preview/staging identity requires access.
- Operator OAuth acceptance passed the unmodified resumable provider with a
  25 MiB temporary object in seven chunks of at most 4 MiB, confirmed-offset
  recovery, generation-bound exact read, terminal cancellation, and complete
  cleanup. This is provider evidence only; browser requests and deployed Vercel
  WIF remain unverified.
- An isolated operator migration rehearsal passed against a real disposable GCS
  bucket, synthetic legacy provider, and local database: exact live bytes,
  deduplication, locator/cleanup recovery boundaries, cached old-URL refusal,
  orphan recovery, idempotent rerun, private anonymous denial, and unchanged
  logical file/link/audit snapshots. It is not Production or UploadThing
  cutover evidence.
- Focused migration integration checks pass for one physical object shared by
  current/superseded logical records and for source-cleanup/DB-completion
  recovery without recopying or logical metadata changes. This is isolated
  fake-source evidence, not a live cutover.
- Use untouched `5772dd7`, immediately before #88 implementation, for regression
  classification. The full database comparison reproduced all 44 remaining
  failing test names, the same two failed setup suites, and 16 skips. The only
  new schema-list expectation was the 0139 cleanup table and is fixed. The
  migration-package baseline also reproduced its single Packaging-master
  failure (34 passed, 1 failed).
- Final root gates passed all package lint, typechecks, builds, and
  runtime/observability tests. The fresh web build passed in 35 seconds; its
  full test rerun passed 776/777 with zero failed suites and only the reproduced
  Quote draft revision 1-versus-0 baseline failure. The schema recheck passed 18
  with five baseline failures; both 0138/0139 table expectations are present.

## Evidence

- [Vercel payload limits and response streaming](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).
- [Vercel OIDC claims](https://vercel.com/docs/oidc/reference).
- [Google Cloud object preconditions](https://docs.cloud.google.com/storage/docs/request-preconditions).
- [Google Cloud resumable upload protocol](https://docs.cloud.google.com/storage/docs/performing-resumable-uploads).
- [Google Cloud upload session lifecycle](https://docs.cloud.google.com/storage/docs/resumable-uploads).
- `apps/web/lib/commercial-attachment.ts`: 25 MiB Commercial file limit.
- `packages/db/src/artifacts.ts`: fingerprint locks, provider persistence,
  rollback cleanup, retained logical versions, and deletion.
- `packages/db/src/artifact-storage-migration.ts` and migration 0139: inventory,
  locked locator compare-and-swap, durable source cleanup, recovery, and exact
  GCS readiness verification.
- `packages/db/src/commercial-workflow.ts` and the enquiry drawing route:
  authenticated Artifact-reader delivery and historical local-file fallback.
- `packages/db/src/quotation-versions.ts` and `quote-drawings.ts`: issued
  snapshot pinning, draft drawing selection, and provider metadata lookup.
- `apps/web/lib/pricing/read-quote-drawing.ts` and
  `quote-drawing-download.ts`: shared source-byte reads and ZIP assembly.
- `apps/web/app/commercial/quotes/enquiry/[id]/pdf/route.ts`: current
  revision-aware server-side PDF fetch, unavailable handling, and draft preview.
- `apps/web/components/pdf-document-preview.tsx`: multipage PDF viewer.

The canonical [Artifact glossary](../glossary/artifacts.md), access definitions,
and [ADR 0007](../adr/0007-private-artifact-delivery.md) describe the approved
target. Historical UploadThing identifiers and public URLs remain migration and
audit evidence; they are not an application runtime provider.
