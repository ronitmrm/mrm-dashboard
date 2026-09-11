# Private Google Cloud Storage Artifacts

Status: Design decisions recorded; implementation and cutover have not started.
Date: 2026-09-09.
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
- This deliberately expands the issue's no-resumable-upload scope while keeping
  its prohibition on browser provider URLs, signing permissions, and bucket
  CORS configuration. No compose-based chunk-object system is needed.

- Vercel limits request payloads to 4.5 MB. Increasing Next.js body limits does
  not remove that hosting limit. Stream authenticated download responses to
  preserve larger existing files; verify bytes before starting delivery and
  retain the issue's no-range-request scope.
- The issue's overview switches the provider locator before deleting the
  UploadThing source; its detailed migration reverses that order. Use
  copy, verify, atomically commit the GCS locator and pending source-cleanup
  record, then delete the source and record completion. Source deletion failure
  keeps migration explicitly incomplete.
- Deterministic object reuse makes the current unconditional rollback cleanup
  unsafe: a failed transaction can delete an object another operation reused.
  Verified uploaded bytes must remain safely reusable after a database failure;
  cleanup must respect committed references, fingerprint locks, and object
  generations. Decide the narrow implementation during coding.
- Both deployments sharing PostgreSQL must understand GCS before any shared
  locator switches. Remove compatibility only after source cleanup and
  acceptance complete everywhere. Keep expand/migrate/contract as controlled
  holiday cutover stages; do not build continuous-availability machinery.
- Historical local reads apply only when a logical file has no physical object;
  clearing a provider URL must never trigger local fallback.

- Include existing Artifact consumers found in code, including Maintenance
  photos; preserve their current permissions and workflows even where the
  issue's route examples do not enumerate them.

## Acceptance additions to #88

- Prove a permitted 25 MiB upload succeeds on Vercel through bounded requests,
  returns exact bytes through authenticated download, and retains the existing
  invalid-size/content rejection behavior.
- Prove chunk retry does not duplicate or overwrite retained evidence and
  unauthorized/expired upload sessions cannot advance or finalize. Keep tests
  focused on the shared transport and existing business authorization seams.
- Prove temporary-upload cleanup cannot touch a retained object. This is not
  a new automatic retention/deletion policy for Artifacts.

## Verification still needed

- Run the non-mutating live inventory before planning cutover duration or
  claiming all retained objects fit any particular size. This checkout lacks
  `apps/web/.env.local`, so the attempted aggregate query did not execute.
- Verify actual Vercel project and staging identity claims. The connected
  Vercel account cannot access `mrm-dashboard`; GitHub deployment labels alone
  do not prove the configured OIDC claims. Do not grant all preview deployments
  bucket access to satisfy staging access.

## Evidence

- [Vercel payload limits and response streaming](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).
- [Vercel OIDC claims](https://vercel.com/docs/oidc/reference).
- [Google Cloud object preconditions](https://docs.cloud.google.com/storage/docs/request-preconditions).
- [Google Cloud resumable upload protocol](https://docs.cloud.google.com/storage/docs/performing-resumable-uploads).
- [Google Cloud upload session lifecycle](https://docs.cloud.google.com/storage/docs/resumable-uploads).
- `apps/web/lib/commercial-attachment.ts`: 25 MiB Commercial file limit.
- `packages/db/src/artifacts.ts`: fingerprint locks, provider persistence,
  rollback cleanup, retained logical versions, and deletion.
- `packages/db/src/commercial-workflow.ts` and the enquiry drawing route:
  current public-URL delivery and historical local-file fallback.

The canonical [Artifact glossary](../glossary/artifacts.md), access definitions,
and [ADR 0007](../adr/0007-private-artifact-delivery.md) describe the approved
target. The storage architecture and UploadThing implementation specification
still describe the current provider until the new implementation is verified.
