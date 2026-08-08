# Canonical dashboard projection contract

Date: 2026-08-08  
Authority: PostgreSQL canonical tables; projection is rebuildable

## Identity and boundaries

One read-model stream exists per organization. Versions are monotonically increasing positive integers scoped to that organization. A successful refresh publishes one version containing Conventional, CNC, and Forging snapshots; a dashboard-state read extracts only the server-authorized requested floor.

Every source statement includes `organization_id`. Floor assignment uses the established canonical floor fields and legacy fallback to Conventional for missing/unrecognized legacy values. Client-supplied payloads never choose the organization or bypass server-side floor normalization. Quality, planning, first-piece, machine-plan, correction, and physical rows follow the same floor boundary.

The stored model may contain every floor so one repeatable-read refresh is internally consistent. The HTTP/database delivery boundary may return only one floor and must never transfer `productionFloorSnapshots` to the client.

## Required source categories

The projection retains every currently observable category.

Data-entry source categories and row limits, newest `changed_at` then stable `source_id` first:

| Category                        | Limit | Category                       | Limit |
| ------------------------------- | ----: | ------------------------------ | ----: |
| `cycle`                         | 2,500 | `employee`                     | 1,000 |
| `first_piece_inspection_report` | 2,500 | `hourly_quality_check`         | 5,000 |
| `machine_master`                | 1,000 | `maintenance_checklist_master` | 2,000 |
| `maintenance_master`            | 1,000 | `maintenance_schedule`         | 2,500 |
| `maintenance_task`              | 5,000 | `planning_holiday`             | 1,000 |
| `production_card`               | 5,000 | `quality_parameter_master`     | 2,000 |
| `rejection_reason_master`       |   500 | `rejection_remark_master`      |   500 |
| `rejection_type_master`         |   500 | `rm_inward`                    | 2,000 |
| `route`                         | 2,500 | `setup_checklist_master`       | 2,000 |
| `setup_checklist_session`       | 5,000 | `shop_floor_status`            | 5,000 |
| `tooling`                       | 2,500 | `work_order`                   | 5,000 |

Physical source groups and limits:

| Group                | Limit | Group               |  Limit |
| -------------------- | ----: | ------------------- | -----: |
| `attendanceRecords`  | 5,000 | `dispatchApprovals` |  2,000 |
| `machineConstraints` | 2,000 | `planOverrides`     |  2,000 |
| `plannerPriorities`  | 2,000 | `productionEntries` | 10,000 |
| `routeChanges`       | 2,000 | `routeSelections`   |  2,500 |
| `setupCompletions`   | 5,000 | `trainingRecords`   |  2,500 |

Corrections retain the newest 5,000 rows and preserve active-target plus workflow-cascade semantics.

The output contract also retains the established derived/virtual dashboard categories: `dispatch`, `rejection_classification`, `raw_material_plan`, `machine_planning`, `quality_inspection`, and `first_piece_inspection_master`, together with all source-backed categories. First-piece tasks, masters, and completed reports remain distinct. Category order and empty-category visibility match the behavior oracle.

## Coverage

Every bounded category/group carries typed coverage in the source watermark and floor response:

```text
returned: number
available: number
limit: number
truncated: boolean
```

The single indexed source statement computes `available` before limiting and retrieves at most `limit` rows per category. Aggregate `truncatedGroups` may remain for compatibility, but cannot replace per-category facts. A floor response cannot report global counts that include another floor; floor coverage is derived from the authorized floor. Any `available > returned` state produces the delivery contract's visible partial-coverage indicator. Explicit history/export paths remain exhaustive.

## Version and publication transaction

The worker claims durable work and opens one repeatable-read transaction. Inside it, the worker:

1. reads the bounded canonical projection once;
2. reads only the prior floor-specific machine-plan continuity fields;
3. builds all floor snapshots and their coverage/watermark;
4. locks/increments the organization dashboard watermark;
5. inserts the immutable read-model version;
6. updates the watermark, inserts the idempotent outbox event, and completes the job/attempt;
7. commits once.

Readers see either the prior complete version or the new complete version. Build failure publishes no version or invalidation; retry state remains durable. A refresh may advance the version even when normalized content is equal. `knownVersion` means only “this exact latest version is already held”; when equal, state returns status/version metadata with no payload.

## Previous-state requirement

Planning continuity may read only these fields from the latest model, separately for each floor: `jcNo`, `machine`, `optionNumber`, `partCode`, `routeMachine`, and `setupNo` from `productionControl.machinePlanDetailRows`.

The query must project those paths/fields in PostgreSQL. It may not select or transfer the complete prior JSON payload. No other current-model category may depend on prior derived state; canonical sources remain authoritative.

## Refresh triggers and reconstruction

Every canonical write that can change an included category updates `derived.dashboard_source_records` transactionally and enqueues/coalesces durable dashboard work in the same canonical transaction. Insert, update, reversal/inactivation, and delete remove or replace the projection identity correctly. The projection can be truncated and rebuilt from canonical sources with identical normalized output and coverage.

## Acceptance gates

- one indexed source statement, category limits, per-floor coverage, and the packet/plan budgets from Ticket 3;
- all source and derived output categories present, including empty categories;
- organization and three-floor isolation with invalid/missing legacy floor fallback covered;
- correction cascade, reversible pause, quality/planning, first-piece separation, and machine-plan continuity fingerprints equal;
- version monotonicity, atomic publication, failure rollback, retry, and idempotent outbox evidence;
- previous-state query transfers only the six allowed fields, never the complete prior payload;
- rebuild fingerprint equals the incrementally maintained projection.

## Known implementation deltas

The current candidate establishes the projection and one-statement bounded source read, but it is not contract-complete: coverage exposes only aggregate limits/truncated groups instead of per-category returned/available facts, and refresh currently selects the complete previous payload before narrowing it in application memory. Both are release blockers for the dashboard projection implementation slice.
