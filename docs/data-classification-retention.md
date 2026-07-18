# Migration Data Classification and Retention

Date: 2026-07-18

Status: Approved classification; retention durations require business approval

## Classes

| Class                    | Examples                                                                                            | Handling                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Restricted identity      | Legacy user rows, password hashes, sessions, verification records                                   | Keep only inside sealed source artifacts for the shortest approved period. Exclude from working extracts, staging, logs, and canonical import. |
| Confidential business    | Customers, enquiries, quotes, prices, purchase orders, production, quality, maintenance, attendance | Encrypt artifacts and backups at rest and in transit. Limit access to named migration operators and approvers.                                 |
| Confidential files       | Drawings, attachments, resumes, purchase-order and design files                                     | Inventory by checksum, preserve source paths as evidence, and transfer only to approved persistent object storage.                             |
| Operational audit        | Corrections, reversals, actor text, migration conflicts, reconciliation evidence                    | Append-only. Preserve provenance and approved exception decisions.                                                                             |
| Disposable derived state | Convex snapshot chunks, PostgreSQL read models, Redis caches                                        | Rebuild from canonical PostgreSQL data. Do not treat as migration authority.                                                                   |
| Sanitized fixtures       | Synthetic or irreversibly redacted migration test data                                              | May be committed when it contains no production identity or confidential business values.                                                      |

## Rules

- Every immutable source artifact has a SHA-256 manifest, byte size, operator,
  source kind, and row-count inventory before profiling.
- Working extracts deny-list all Convex Auth/component tables and SQLite
  `app_users`, `app_user_permissions`, and `app_sessions`.
- Raw payloads and conflict evidence must never be written to application logs.
- Production artifacts, exports, workbooks, database files, and attachment
  trees are never committed.
- Access to migration credentials expires after cutover.
- Old Convex and SQLite sources remain read-only through the signed acceptance
  window.
- Destruction requires successful reconciliation, restore verification,
  business sign-off, and expiry of the approved retention duration.

## Decisions Still Required

- Retention duration for sealed Convex and SQLite artifacts.
- Retention duration for failed rehearsal artifacts and conflict evidence.
- Object-storage provider, region, lifecycle policy, and legal retention for
  business files.
- HR JSON and resume retention after the separate HR discovery gate.
