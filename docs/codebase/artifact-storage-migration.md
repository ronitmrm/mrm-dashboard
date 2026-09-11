# Artifact storage migration runbook

The migration command is code-ready but no retained source has been migrated.
It changes physical locators only. Logical Artifact IDs, links, versions,
current/superseded/deleted state, issued references, audit history,
Organization-scoped fingerprints, and `core.files.storage_key` remain intact.

## Preconditions

1. Confirm the selected database is Vercel Production's canonical database.
   The 2026-09-11 read-only inventory targeted Neon's active/default `staging`
   branch, but its mapping to Vercel Production is still unconfirmed.
2. Schedule the approved holiday/zero-user window. Pause every deployment,
   worker, and operator command that can write Artifacts in the shared
   database. Back up PostgreSQL and record deployment, schema, and cloud
   configuration versions.
3. Apply additive expand migrations `0137_google_cloud_artifact_storage_expand.sql`,
   `0138_pending_artifact_uploads.sql`, and
   `0139_artifact_source_cleanups.sql`, in order. Keep UploadThing credentials
   and both read/delete providers available. Use normal operator `gcloud auth`;
   the command injects that OAuth client and never probes ADC.
4. Deploy and accept the dual-reader/GCS-writer application before changing a
   locator. Vercel reports `main` as `productionGitBranch` and deployment
   `dpl_tf9hN7UUwYtDpVvs33eBcD7VRh2f` as READY; this local
   `refactor/sept-26` branch is not deployed. Verify Production WIF and
   authorized application byte traffic while Artifact writes remain paused.

## Commands

The operator needs `WEB_DATABASE_URL` and the existing `UPLOADTHING_TOKEN`,
plus the non-secret GCS identifiers in the [configuration record](google-cloud-artifacts-setup.md)
and normal gcloud login. Applying the expand schema also needs the project's
existing migration database credential. No GCS JSON key or ADC login is needed.
On 2026-09-11, Vercel withheld the database/UploadThing Secret values from the
CLI and neither value was available in this VM's project environment. Supply
them through the normal secret-management path or the gitignored
`apps/web/.env.local`; never put credentials in this runbook.

Run from `apps/web` with the required database/provider environment. Inventory
is the safe default and needs only the database configuration:

```sh
node --conditions=react-server --env-file-if-exists=.env.local --import tsx scripts/migrate-artifact-storage.ts
node --conditions=react-server --env-file-if-exists=.env.local --import tsx scripts/migrate-artifact-storage.ts --mode=verify
```

Mutation requires an explicit mode and the pause acknowledgement:

```sh
node --conditions=react-server --env-file-if-exists=.env.local --import tsx scripts/migrate-artifact-storage.ts --mode=migrate --limit=50 --acknowledge-paused-artifact-writes
node --conditions=react-server --env-file-if-exists=.env.local --import tsx scripts/migrate-artifact-storage.ts --mode=reconcile --limit=50 --acknowledge-paused-artifact-writes
```

The command emits compact JSON without provider keys, public URLs, credentials,
or sessions. Exit `2` means work or verification remains; exit `1` means the
command failed. Repeat `migrate` until no legacy live object remains, repeat
`reconcile` until no pending cleanup or failed-deletion orphan remains, then run
`verify`.

Before resuming normal uploads, arrange periodic execution of the existing
bounded temporary-cleanup command with the same operator database/GCS access:

```sh
node --conditions=react-server --env-file-if-exists=.env.local --import tsx scripts/cleanup-pending-artifact-uploads.ts --limit=100
```

This processes expired, abandoned, rejected, or finalized temporary uploads;
it does not expire retained Artifacts. The command is implemented and tested;
its live scheduling remains a cutover operation.

## Recovery guarantees

- Source bytes are checked against PostgreSQL size/SHA before deterministic GCS
  upload. The GCS provider verifies exact destination bytes.
- Under the Artifact fingerprint and physical-object locks, one transaction
  rechecks the source locator and live references, changes only the physical
  locator, clears `public_url`, and inserts its pending cleanup row.
- UploadThing deletion starts only after that commit. Completion requires the
  exact recorded legacy HTTPS URL to return 404 or 410; redirects, cached 200,
  provider ambiguity, and database completion-write failure stay pending.
- A copy-before-commit interruption reuses the deterministic destination. A
  locator discrepancy never overwrites the row or deletes the GCS copy. A
  committed cleanup resumes without copying logical records.
- Deleted physical tombstones are not copied. A zero-live-reference
  `deletion_failed` object is deleted under the same locks; a
  `deletion_failed` object with live references is a blocker and is not changed.

## Contract-removal gate

Contract removal is the final stage of the requested issue scope, after verified
live acceptance. Its live window still requires coordination. Readiness requires:

- cleanup schema present; zero live UploadThing objects;
- zero pending/failed source cleanups and zero metadata/lifecycle blockers;
- every live GCS object read and matched to PostgreSQL byte size and SHA;
- production WIF plus authorized/unauthorized application delivery accepted;
- browser 25 MiB upload, large ZIP, multipage PDF, and final-reference deletion
  accepted in Production; every recorded old public URL unavailable.

Only then remove UploadThing dependencies/credentials and the transitional
`public_url` contract. No automatic `DROP public_url` migration is included.

The latest safe evidence is metadata-only: 38 live UploadThing physical objects
(7,419,132 bytes), 51 logical files (48 current, 3 superseded), and no reported
anomalies in the inspected Neon branch. Operator OAuth provider probes passed
25 MiB exact/resumable behavior and cleaned their synthetic resources. Neither
report proves the Production database mapping, deployed WIF, or live cutover.

An independent isolated rehearsal also passed with normal operator gcloud OAuth,
a real disposable private GCS bucket, a synthetic legacy provider, and a local
database. It verified eight live objects/363 bytes (including 27 bytes), seven
completed cleanup rows, physical deduplication, unchanged preexisting object
generation, exact GCS readiness reads, three interruption boundaries, mismatch
refusal, cached-old-URL blocking until 404, deletion-failed orphan recovery,
untouched tombstone/local-only rows, idempotent rerun, and anonymous GET 403.
Full logical file/link/audit snapshots were unchanged. This proves the bounded
tooling against synthetic source data; it does not prove UploadThing cleanup,
the Production database mapping, deployed WIF, or application acceptance.
All rehearsal objects and the disposable bucket were deleted; the bucket now
returns 404 and the cleanup receipt reports `cleaned=true`.

Final local checks passed: migration integration 2/2, focused schema contract
1/1, ledger/auth boundary checks 4/4, every package lint/typecheck/build, the
fresh 35-second web build, and runtime/observability tests. The full web rerun
passed 776/777 with zero failed suites; only the reproduced Quote draft revision
1-versus-0 baseline failed. The schema recheck passed 18 with five baseline
failures, including correct 0138/0139 table expectations. Untouched pre-#88
`5772dd7` reproduced all 44 remaining full-database failing test names, the same
two failed setup suites and 16 skips; its migration package reproduced the
single Packaging-master failure (34 passed, 1 failed).
