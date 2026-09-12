# Artifact storage migration runbook

On 2026-09-12, the user approved the Production maintenance cutover. All 36
recoverable files (7,419,078 bytes) now have private GCS locators and verified
copies. UploadThing confirmed deletion of their 36 old source objects. The two
previously waived stale drawing records were retired with before/after audit
events; their drawing references, original locators, and history remain intact.
The application is GCS-only. Deployment requires exact old-URL reconciliation
and a passing readiness check. Migration changes physical locators only.
Logical Artifact IDs, links, versions,
current/superseded/deleted state, issued references, audit history,
Organization-scoped fingerprints, and `core.files.storage_key` remain intact.

## Preconditions

1. Use the confirmed Vercel Production database: Neon project
   `steep-mouse-42175009`, primary/default branch
   `br-polished-voice-axsmr68e` (`staging`), database `neondb`. Do not use the
   historical branch named `production`.
2. Schedule the approved holiday/zero-user window. Pause every deployment,
   worker, and operator command that can write Artifacts in the shared
   database. Back up PostgreSQL and record deployment, schema, and cloud
   configuration versions.
3. Apply additive expand migrations `0137_google_cloud_artifact_storage_expand.sql`,
   `0138_pending_artifact_uploads.sql`, and
   `0139_artifact_source_cleanups.sql`, in order while the old deployment is
   paused. Production applied 0137–0140 during the approved 2026-09-12 window.
   Use normal operator `gcloud auth`; commands inject that OAuth client
   and never probe ADC.
4. Run inventory, migrate verified legacy bytes, remove the committed old
   objects with separately approved operator tooling or the UploadThing
   dashboard, reconcile exact recorded URLs to 404/410, and pass readiness. Do
   not deploy the GCS-only application while
   any live legacy locator, pending cleanup, or metadata blocker remains.
5. Deploy and accept the GCS-only application. Vercel reports `main` as
   `productionGitBranch` and deployment
   `dpl_tf9hN7UUwYtDpVvs33eBcD7VRh2f` as the pre-cutover baseline. Verify Production WIF,
   authorized/unauthorized application byte traffic, and browser workflows
   while Artifact writes remain paused. Resume only after acceptance.

## Commands

The Windows cutover used an ignored one-off driver composing the existing
migration repository/service with the app's Development OIDC provider. It
verified existing GCS copies byte-for-byte before committing locators. The
Neon plugin supplied the operator credential; the ordinary migration role
does not have file-table access. The repository uses one connection to respect
restricted operator role limits. Credentials and the driver are not deployed.

Recovery branch `backup-pre-release-99-gcs-20260912` (`br-morning-sound-axoqwock`)
preserves the database before migrations and locator changes. Retain it through
release acceptance. Restoring the old database alone would restore unavailable
UploadThing locators, so recovery must account for the retained GCS copies.

The one-off operator configuration is stored outside the repository at
`~/.config/mrm/artifact-operator.env` (mode 0600). It provides
`OPERATOR_DATABASE_URL` for the confirmed direct Production endpoint plus the
six non-secret GCS identifiers; no value is copied into this runbook. The CLI
also retains its ordinary web-database fallback for local fixtures. Never load
the owner connection into Next.js or Vercel. Dedicated SQL-created app/migration
passwords are not retrievable through the Neon plugin and are not required for
this one-off operator path. The migration CLI has no UploadThing SDK/token,
GCS JSON key, or ADC dependency; normal operator gcloud OAuth is required for
GCS operations. Separately authorized recovery of an invalid legacy locator is
outside this CLI.

Run from `apps/web` with the required database/provider environment. Inventory
is the safe default and needs only the database configuration. Load the operator
file into each command process, using this VM's verified IPv4 settings. Force
the database connection read-only for inventory and verification:

```sh
rtk proxy env PGOPTIONS='-c default_transaction_read_only=on' node \
  --dns-result-order=ipv4first --no-network-family-autoselection \
  --conditions=react-server --env-file="$HOME/.config/mrm/artifact-operator.env" \
  --import tsx scripts/migrate-artifact-storage.ts
rtk proxy env PGOPTIONS='-c default_transaction_read_only=on' node \
  --dns-result-order=ipv4first --no-network-family-autoselection \
  --conditions=react-server --env-file="$HOME/.config/mrm/artifact-operator.env" \
  --import tsx scripts/migrate-artifact-storage.ts --mode=verify
```

Mutation requires an explicit mode and the pause acknowledgement:

```sh
rtk proxy env -u PGOPTIONS node \
  --dns-result-order=ipv4first --no-network-family-autoselection \
  --conditions=react-server --env-file="$HOME/.config/mrm/artifact-operator.env" \
  --import tsx scripts/migrate-artifact-storage.ts \
  --mode=migrate --limit=50 --acknowledge-paused-artifact-writes
rtk proxy env -u PGOPTIONS node \
  --dns-result-order=ipv4first --no-network-family-autoselection \
  --conditions=react-server --env-file="$HOME/.config/mrm/artifact-operator.env" \
  --import tsx scripts/migrate-artifact-storage.ts \
  --mode=reconcile --limit=50 --acknowledge-paused-artifact-writes
```

The command emits compact JSON without provider keys, public URLs, credentials,
or sessions. It identifies source deletion as
`external-uploadthing-dashboard` and accepts cleanup only after the exact
recorded URL returns 404/410. Exit `2` means work or verification remains; exit
`1` means the command failed. Repeat `migrate` until no legacy live object
remains. After each committed copy, delete that old object with separately
approved operator tooling or the UploadThing dashboard, then repeat `reconcile`
until no pending cleanup or failed-deletion orphan remains and run `verify`.

Before resuming normal uploads, arrange periodic execution of the existing
bounded temporary-cleanup command with the same operator database/GCS access:

```sh
rtk proxy env -u PGOPTIONS node \
  --dns-result-order=ipv4first --no-network-family-autoselection \
  --conditions=react-server --env-file="$HOME/.config/mrm/artifact-operator.env" \
  --import tsx scripts/cleanup-pending-artifact-uploads.ts --limit=100
```

This processes expired, abandoned, rejected, or finalized temporary uploads;
it does not expire retained Artifacts. The command is implemented and tested;
its live scheduling remains a cutover operation.

## Recovery guarantees

- Source bytes are fetched directly from the exact recorded URL with no-store,
  manual redirects, and a bounded timeout. Only HTTPS UploadThing hosts whose
  `/f/<key>` path matches the recorded provider key are eligible. Bytes are
  checked against PostgreSQL size/SHA before deterministic GCS upload, and the
  GCS provider verifies exact destination bytes.
- Under the Artifact fingerprint and physical-object locks, one transaction
  rechecks the source locator and live references, changes only the physical
  locator, clears `public_url`, and inserts its pending cleanup row.
- The migration tool never deletes UploadThing objects. After the locator
  commit, an operator removes the old object with separately approved tooling
  or the UploadThing dashboard. Completion requires the exact recorded legacy
  HTTPS URL to return 404 or 410; redirects, cached 200, provider ambiguity, and
  database completion-write failure stay pending.
- A copy-before-commit interruption reuses the deterministic destination. A
  locator discrepancy never overwrites the row or deletes the GCS copy. A
  committed cleanup resumes without copying logical records.
- Deleted physical tombstones are not copied. A zero-live-reference GCS
  `deletion_failed` object gets a generation-fenced delete under the same locks.
  A legacy orphan completes only after its exact public URL is externally absent.
  A `deletion_failed` object with live references is a blocker and is not changed.

## Contract-removal gate

Contract removal is the final stage of the requested issue scope, after verified
live acceptance. Its live window still requires coordination. Readiness requires:

- cleanup schema present; zero live UploadThing objects;
- zero pending/failed source cleanups and zero metadata/lifecycle blockers;
- every live GCS object read and matched to PostgreSQL byte size and SHA;
- production WIF plus authorized/unauthorized application delivery accepted;
- browser 25 MiB upload, large ZIP, multipage PDF, and final-reference deletion
  accepted in Production; every recorded old public URL unavailable.

The UploadThing dependency and runtime adapter are removed in this local tree.
Deploy that code only after live locator migration and source reconciliation
pass; keep Artifact writes paused through deployed acceptance. After verified
live acceptance, remove the old Vercel UploadThing secret and schedule the separately
coordinated destructive contraction of the transitional `public_url` column.
No automatic `DROP public_url` migration is included.

## Historical preflight and rehearsal evidence

The following results predate the approved cutover described above.

The 2026-09-12 read-only Production preflight confirmed 38 live UploadThing
physical objects (7,419,132 bytes) and 51 logical files (48 current, 3
superseded). Thirty-six sources totaling 7,419,078 bytes were fetched and matched
to their recorded size/SHA. A separately authorized one-off copy used the
user-supplied credential outside application code to upload those 36 objects to
the private bucket; every GCS readback matched exact size/SHA, the bucket listed
exactly 36 objects/7,419,078 bytes, and anonymous access returned 403. No source
or database row changed and every database locator still names UploadThing, so
these immutable copies can be reused during locator cutover. All 36
real UploadThing URL/key locators also pass the
strict migration validator. Two current uploaded drawing records have no source:
their 27-byte payloads can be reproduced exactly from repository evidence and
match both stored hashes, but their recorded `example.test` URLs are invalid,
neither object exists in UploadThing, and the full original business-drawing
PDFs are absent. On 2026-09-12 the user identified these two drawings as stale,
waived recovery, and approved merging PR #70 into `staging`. Recovery is no
longer a merge prerequisite. This waiver does not delete their database records
or change the migration CLI's live-object checks; account for the stale records
during the separate Production cutover without fabricating bytes or cleanup
evidence.
Production has neither migration 0138 nor 0139 yet. No live locator, byte, or
database row changed during inventory/preflight. Operator OAuth provider probes
passed 25 MiB exact/resumable behavior and cleaned their synthetic resources;
deployed WIF and live cutover remain unverified.

An independent isolated rehearsal also passed with normal operator gcloud OAuth,
a real disposable private GCS bucket, a synthetic legacy provider, and a local
database. It verified eight live objects/363 bytes (including 27 bytes), seven
completed cleanup rows, physical deduplication, unchanged preexisting object
generation, exact GCS readiness reads, three interruption boundaries, mismatch
refusal, cached-old-URL blocking until 404, deletion-failed orphan recovery,
untouched tombstone/local-only rows, idempotent rerun, and anonymous GET 403.
Full logical file/link/audit snapshots were unchanged. This proves the bounded
tooling against synthetic source data; it does not prove Production
UploadThing cleanup, deployed WIF, or application acceptance.
All rehearsal objects and the disposable bucket were deleted; the bucket now
returns 404 and the cleanup receipt reports `cleaned=true`.

Before deprecation, the 2026-09-11 checks passed: migration integration 2/2, focused schema contract
1/1, ledger/auth boundary checks 4/4, every package lint/typecheck/build, the
fresh 35-second web build, and runtime/observability tests. The full web rerun
passed 776/777 with zero failed suites; only the reproduced Quote draft revision
1-versus-0 baseline failed. The schema recheck passed 18 with five baseline
failures, including correct 0138/0139 table expectations. Untouched pre-#88
`5772dd7` reproduced all 44 remaining full-database failing test names, the same
two failed setup suites and 16 skips; its migration package reproduced the
single Packaging-master failure (34 passed, 1 failed).

The 2026-09-12 deprecation checks passed: migration integration 2/2, Artifact
integration 12/12, and focused web storage/delivery/deletion/ledger tests 13/13.
Web/DB typechecks, changed-code lint/format, DB build, and a fresh 34-second web
build passed. pnpm 11.15.0 validated the frozen lockfile offline, including all
897 supply-chain entries. The disposable PostgreSQL test container and its
volume were removed. These checks used local synthetic data; Production
database locators and UploadThing source objects remain unchanged.
