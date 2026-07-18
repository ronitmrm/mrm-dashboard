# PostgreSQL migration source inventory

Date: 2026-07-18
Status: Pricing and Convex source measurement plus the first combined staging
rehearsal are complete; the separate HR source gate remains open

This report inventories the immutable source exports supplied for the unified
PostgreSQL migration. Raw exports remain outside the repository and were opened
read-only.

## Artifact identity

| Source                  | Artifact                                                   |     Bytes | SHA-256                                                            |
| ----------------------- | ---------------------------------------------------------- | --------: | ------------------------------------------------------------------ |
| Pricing                 | `pricing-sqlite-export-20260718-203337.zip`                |    45,266 | `40e6d256dc1279b343951c3024efb0470663e0cf4d546537318c888b25bd190b` |
| Pricing SQLite snapshot | `pricing-data/pricing_app.db` inside the ZIP               |   438,272 | `cda45d16fcd50908b94b84e2958c30cd32c33e28c5f0b0ea80d78f414fc43cb3` |
| Dashboard               | `mrm-dashboard-convex-brilliant-spider-229-2026-07-18.zip` | 1,330,337 | `e31158f68b082af720c9d36816ce967de181c1132f1f8867f5e642dc068409d3` |

The Pricing manifest was created at `2026-07-18T15:03:37.801Z`. Its snapshot
size, checksum, table count, per-table counts, and SQLite integrity result all
match an independent read-only inspection.

The Convex archive uses ZIP64 metadata even though it is small. Migration
tooling therefore requires `fflate` 0.8.3 or newer; 0.8.3 specifically fixes
ZIP64 extra-field parsing and improves undersized ZIP64 archive support.

## Pricing SQLite

Summary:

- `PRAGMA integrity_check`: `ok`
- tables: 44
- rows: 630 total; 628 canonical and 2 excluded identity rows
- schema objects: 44 tables and 2 explicit indexes; no triggers or views
- populated file-reference columns: none
- foreign-key violations: 3

The export contains no populated `attachments` or `drawing_history` rows, and
the file-reference scan found no non-empty values in file, path, attachment,
document, or drawing columns.

### Per-table counts

| Table                               | Rows | Disposition                         |
| ----------------------------------- | ---: | ----------------------------------- |
| `app_sessions`                      |    1 | excluded identity                   |
| `app_user_permissions`              |    0 | excluded identity                   |
| `app_users`                         |    1 | excluded identity                   |
| `attachments`                       |    0 | canonical                           |
| `bom_lines`                         |    0 | canonical                           |
| `bulk_price_revision_changes`       |    0 | canonical                           |
| `bulk_price_revisions`              |    0 | canonical                           |
| `clarification_tasks`               |    0 | canonical                           |
| `correction_logs`                   |    0 | canonical                           |
| `counters`                          |    3 | canonical                           |
| `customers`                         |   27 | canonical                           |
| `design_bom_lines`                  |    0 | canonical                           |
| `design_categories`                 |   23 | canonical                           |
| `design_processes`                  |   13 | canonical                           |
| `design_subcategories`              |  439 | canonical                           |
| `design_tasks`                      |    0 | canonical                           |
| `drawing_history`                   |    0 | canonical                           |
| `engineering_change_note_decisions` |    0 | canonical                           |
| `engineering_change_notes`          |    0 | canonical                           |
| `enquiries`                         |    0 | canonical                           |
| `enquiry_import_review_rows`        |    2 | canonical; conflict review required |
| `enquiry_import_reviews`            |    1 | canonical; conflict review required |
| `enquiry_items`                     |    0 | canonical                           |
| `followups`                         |    0 | canonical                           |
| `price_master`                      |    0 | canonical                           |
| `product_grades`                    |   37 | canonical                           |
| `product_machine_types`             |    3 | canonical                           |
| `product_rod_types`                 |    8 | canonical                           |
| `products`                          |    0 | canonical                           |
| `purchase_order_lines`              |    0 | canonical                           |
| `purchase_orders`                   |    0 | canonical                           |
| `quality_check_parameters`          |    0 | canonical                           |
| `quality_check_results`             |    0 | canonical                           |
| `quote_commercial_terms`            |    9 | canonical                           |
| `quote_items`                       |    0 | canonical                           |
| `quote_material_rates`              |   36 | canonical                           |
| `quote_package_components`          |    0 | canonical                           |
| `quote_packaging_options`           |    3 | canonical                           |
| `quote_shipping_terms`              |    2 | canonical                           |
| `quote_terms`                       |    0 | canonical                           |
| `website_applications`              |   12 | canonical                           |
| `website_certifications`            |    4 | canonical                           |
| `website_field_options`             |    6 | canonical                           |
| `website_product_entries`           |    0 | canonical                           |

### Foreign-key conflicts

| Source table                 | Row ID | Missing parent  | FK ID |
| ---------------------------- | -----: | --------------- | ----: |
| `enquiry_import_review_rows` |      2 | `enquiry_items` |     1 |
| `enquiry_import_review_rows` |      3 | `enquiry_items` |     1 |
| `enquiry_import_reviews`     |      1 | `enquiries`     |     0 |

These rows must enter relationship-conflict evidence or an approved
import-review quarantine. They must not be silently attached to invented
enquiries or enquiry items.

## Dashboard Convex

Summary:

- exported document rows: 14,443
- canonical working rows: 13,752
- excluded identity rows: 652
- archive-only rows: 39, including 22 export table-registry rows
- `dataEntries` rows: 13,524 across 19 observed types
- the `_summary` row is an import-count snapshot and is classified archive-only
- `software_raw` is absent; `productionEntries` contains 3 rows, so this
  artifact has no competing production-source overlap

### Physical-table counts

| Table                     |   Rows | Disposition                              |
| ------------------------- | -----: | ---------------------------------------- |
| `_storage`                |      0 | canonical file reconciliation            |
| `_tables`                 |     22 | archive-only export metadata             |
| `attendanceRecords`       |      0 | canonical                                |
| `authAccounts`            |      8 | excluded identity                        |
| `authRateLimits`          |      0 | excluded identity                        |
| `authRefreshTokens`       |    566 | excluded identity                        |
| `authSessions`            |     70 | excluded identity                        |
| `authVerificationCodes`   |      0 | excluded identity                        |
| `authVerifiers`           |      0 | excluded identity                        |
| `corrections`             |    205 | canonical                                |
| `dashboardRefreshState`   |      1 | archive-only derived state               |
| `dashboardSnapshotChunks` |     16 | archive-only derived state               |
| `dashboardSnapshots`      |      0 | archive-only legacy derived state        |
| `dataEntries`             | 13,524 | canonical raw staging; decompose by type |
| `dispatchApprovals`       |      0 | canonical                                |
| `machineConstraints`      |      5 | canonical                                |
| `plannerPriorities`       |      6 | canonical                                |
| `planOverrides`           |      1 | canonical                                |
| `productionEntries`       |      3 | canonical                                |
| `routeChanges`            |      0 | canonical                                |
| `routeSelections`         |      8 | canonical                                |
| `setupCompletions`        |      0 | canonical                                |
| `trainingRecords`         |      0 | canonical                                |
| `users`                   |      8 | excluded identity                        |

### `dataEntries` profile

“Duplicate rows” counts every row participating in a repeated source `key`;
it does not imply the rows are identical. Route, cycle, and tooling keys are
known to be too coarse for direct uniqueness and require compound target keys.

| Entry type                      |  Rows | Disposition              | Missing keys | Duplicate-key groups | Rows in duplicate groups | Mixed payload fields                                                          |
| ------------------------------- | ----: | ------------------------ | -----------: | -------------------: | -----------------------: | ----------------------------------------------------------------------------- |
| `_summary`                      |     1 | archive-only             |            0 |                    0 |                        0 | —                                                                             |
| `cycle`                         | 4,011 | canonical                |            2 |                  884 |                    3,921 | `operationWeight`, `optionNumber`, `setupName`, `setupNo`                     |
| `employee`                      |    72 | canonical                |            0 |                    0 |                        0 | —                                                                             |
| `first_piece_inspection_master` |   514 | canonical                |          513 |                    0 |                        0 | `optionNumber`, `setupNo`, `specification`, `toleranceMinus`, `tolerancePlus` |
| `first_piece_inspection_report` |    58 | canonical                |            0 |                   11 |                       22 | —                                                                             |
| `hourly_quality_check`          |     1 | canonical                |            0 |                    0 |                        0 | —                                                                             |
| `machine_master`                |   160 | canonical                |          159 |                    0 |                        0 | `Unit No`                                                                     |
| `maintenance_checklist_master`  |     4 | canonical                |            0 |                    0 |                        0 | —                                                                             |
| `production_card`               |     3 | canonical                |            0 |                    0 |                        0 | —                                                                             |
| `quality_parameter_master`      |     1 | canonical                |            0 |                    0 |                        0 | —                                                                             |
| `rejection_classification`      |    69 | typed quarantine         |           69 |                    0 |                        0 | —                                                                             |
| `rm_inward`                     |   199 | canonical                |            1 |                   99 |                      198 | `rmInwardKg`                                                                  |
| `route`                         | 4,007 | canonical                |            2 |                  884 |                    3,918 | `finishedGoodsLength`, `optionNumber`, `rodSize`, `setupNo`, `stageWeight`    |
| `setup_checklist`               |     1 | canonical legacy staging |            0 |                    0 |                        0 | —                                                                             |
| `setup_checklist_master`        |     5 | canonical                |            0 |                    0 |                        0 | —                                                                             |
| `setup_checklist_session`       |     2 | canonical                |            0 |                    0 |                        0 | —                                                                             |
| `shop_floor_status`             |   306 | canonical                |            0 |                   39 |                      299 | —                                                                             |
| `tooling`                       | 4,010 | canonical                |            2 |                  884 |                    3,921 | `fixture`, `optionNumber`, `setupName`, `setupNo`                             |
| `work_order`                    |   100 | canonical                |            0 |                    0 |                        0 | —                                                                             |

Mixed fields were observed as both JSON numbers and strings. Transformations
must parse them through explicit type-conflict rules rather than relying on
JavaScript coercion.

## First combined PostgreSQL staging rehearsal

Both source artifacts were loaded into one migration run in the local
temporary PostgreSQL 16 service. Convex documents use
`migration.convex_documents`; all 17 populated canonical Pricing tables use
checked-in typed `migration.sqlite_*` tables.

| Check                                              | Result                                 |
| -------------------------------------------------- | -------------------------------------- |
| Migration run                                      | `7a8d3ee1-1a09-4890-a03d-ff6be65d1250` |
| Convex artifact ID                                 | `5515c104-2de9-4152-974c-6bd1abd514d4` |
| Pricing artifact ID                                | `482dd366-8c5c-4db4-84f3-e832673df999` |
| Convex staged rows                                 | 13,752                                 |
| Pricing staged rows                                | 628                                    |
| Distinct Convex `(source_table, source_id)` keys   | 13,752                                 |
| Excluded auth/system/derived rows staged           | 0                                      |
| Orphan corrections                                 | 0 of 205                               |
| Unknown entry types                                | 0                                      |
| Open Pricing relationship conflicts                | 3                                      |
| Canonical customers                                | 27                                     |
| Canonical material grades                          | 37                                     |
| Canonical machine types                            | 3                                      |
| Canonical rod types                                | 8                                      |
| Source-ID mappings                                 | 75                                     |
| Maximum customer row version after identical rerun | 1                                      |

Both loaders and the first canonical transformation were rerun against the same
migration run. Artifact IDs, row counts, target counts, and customer row
versions remained unchanged, confirming staging and transformation
idempotency.

The rehearsal database is disposable; the source hashes, conflict evidence,
and counts above are the durable evidence. A later full rehearsal must create a
new run manifest against the commit containing the completed transformations.

## Gates and next actions

1. Send the three Pricing import-review FK violations to relationship conflict
   evidence or approve them as discarded import-review residue.
2. Define compound identities for route, cycle, tooling, first-piece report,
   raw-material inward, and shop-floor status transformations.
3. Parse every mixed number/string field through explicit type-conflict
   handling.
4. Transform the remaining Pricing design, quote, website, and conflict-review
   staging tables into approved canonical targets.
5. Keep `_summary`, Convex auth, export metadata, and derived snapshot rows out
   of canonical transformation.
