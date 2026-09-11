# Migration Data Classification and Retention

Date: 2026-07-18

Status: Approved classification; retention durations require business approval

Artifact handling below records the approved target for
[issue #88](./specs/private-google-cloud-artifacts.md). The current UploadThing
public-read exposure persists until verified cutover; the new private boundary
must not be reported as deployed before acceptance.

## Classes

| Class                    | Examples                                                                                            | Handling                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restricted identity      | Legacy user rows, password hashes, sessions, verification records                                   | Keep only inside sealed source artifacts for the shortest approved period. Exclude from working extracts, staging, logs, and canonical import.                |
| Confidential business    | Customers, enquiries, quotes, prices, purchase orders, production, quality, maintenance, attendance | Encrypt artifacts and backups at rest and in transit. Limit access to named migration operators and approvers.                                                |
| Confidential files       | Drawings, attachments, resumes, purchase-order and design files                                     | Retain privately with encryption at rest and in transit. Authorize every byte request through the application; expose no public or signed download URL. |
| Operational audit        | Corrections, reversals, actor text, migration conflicts, reconciliation evidence                    | Append-only. Preserve provenance and approved exception decisions.                                                                                            |
| Disposable derived state | Convex snapshot chunks, PostgreSQL read models, Redis caches                                        | Rebuild from canonical PostgreSQL data. Do not treat as migration authority.                                                                                  |
| Sanitized fixtures       | Synthetic or irreversibly redacted migration test data                                              | May be committed when it contains no production identity or confidential business values.                                                                     |

## Rules

- Every immutable source artifact has a SHA-256 manifest, byte size, operator,
  source kind, and row-count inventory before profiling.
- Working extracts deny-list all Convex Auth/component tables and SQLite
  `app_users`, `app_user_permissions`, and `app_sessions`.
- Raw payloads and conflict evidence must never be written to application logs.
- Production artifacts, exports, workbooks, database files, and attachment
  trees are never committed.
- Retained Artifact bytes require current application session, capability, and
  Organization authorization. Provider locators and resumable upload session
  credentials remain server-only and must never appear in client payloads or
  logs. The former UploadThing public-read exception ends at verified cutover.
- Pending uploads are temporary, uncommitted bytes. Expiry or rejection may
  discard them; temporary-upload cleanup must never delete retained Artifacts.
- Artifact bytes are immutable. Exact bytes deduplicate only inside one
  Organization, while every filename, purpose, version, and business link stays
  logically distinct in PostgreSQL.
- Manual deletion requires `artifacts.delete`, exact-target confirmation, a
  reason, and an audited tombstone. The provider object is deleted only after
  its final live logical reference; no automatic retention cleanup exists.
- Access to migration credentials expires after cutover.
- Old Convex and SQLite sources remain read-only through the signed acceptance
  window.
- Destruction requires successful reconciliation, restore verification,
  business sign-off, and expiry of the approved retention duration.

## Decisions Still Required

- Retention duration for sealed Convex and SQLite artifacts.
- Retention duration for failed rehearsal artifacts and conflict evidence.
- Legal retention durations for business files. The private GCS provider in
  `us-central1`, immutable lifecycle, and manual-only retained deletion are
  settled in issue #88; migration introduces no new legal retention policy.
- Historical HR JSON and resume retention after normalized recruitment import.
