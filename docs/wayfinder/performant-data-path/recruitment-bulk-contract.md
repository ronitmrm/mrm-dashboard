# Recruitment bulk-operation contract

Date: 2026-08-08  
Scope: Candidate assignment and employee-assignment workbooks

## Command boundary

`assignCandidates` and `bulkAssignEmployees` remain the only public bulk command boundaries. Each accepts 1–100 logical input rows, rejects a larger request before opening a transaction, and commits all domain writes plus every Recruitment Assignment Event in one PostgreSQL transaction.

The command has one generated command ID. Input order is domain data: Candidate assignment preserves the first occurrence of each candidate ID; an employee workbook preserves ascending workbook row number. Duplicate workbook row numbers are invalid.

## Candidate assignment

The complete de-duplicated selection is validated before persistence:

- the Recruitment Opening exists, belongs to the organization, and is Open;
- every candidate exists in the organization;
- no candidate has an Active Candidate Application for that opening;
- a Closed Candidate Application remains unchanged and permits a new application cycle.

One set-based insert creates one Assigned Candidate Application per selected candidate. The partial uniqueness rule remains the concurrency authority for active duplicates. If any row conflicts, disappears, or becomes ineligible, the returned count differs and the whole transaction rolls back; no partial application or audit evidence commits.

Applications and audit facts are reconstructed in first-occurrence candidate order from `candidate_id`, never from PostgreSQL `RETURNING` order or generated UUID order.

## Employee workbook

All referenced individual Approved Posts and active Combined Roles are loaded and locked in bounded set-based reads before any write. The entire workbook is validated and its transitions derived before persistence.

Rows execute logically in workbook order. Repeated rows for the same target are deliberate sequential transitions: each transition is validated against the prior derived state, each produces audit evidence, the last transition supplies final stored state, and `row_version` increases by the number of transitions. They are not collapsed merely because persistence uses one update per post.

A Combined Role fans out in primary-post-first, then post-code, then post-ID order. Every member post receives the same derived employee state and one ordered event for that workbook row. Inactive roles/posts, missing primary posts, invalid lifecycle transitions, and unavailable targets fail the complete workbook.

Approved Post semantics remain those in `CONTEXT.md`: Vacant has no appointee, Appointed has not joined, Occupied has joined, Resigned retains the departing assignment while reopening recruitment, and Inactive is not assignable. The exported `@workspace/db/recruitment-domain` policy is the sole owner of these transition and recruitability rules.

## Durable audit ordering

Every Recruitment Assignment Event stores:

- the command ID;
- a zero-based command ordinal;
- the source workbook row number or Candidate selection ordinal;
- the affected candidate/application or Approved Post identity;
- the existing event type and business metadata.

For Candidate assignment, ordinals follow first-occurrence Candidate selection order. For an employee workbook, ordinals follow workbook row, then Combined Role fan-out order. The command ID and ordinal are persisted in metadata, and `source_id` is deterministic as `recruitment:<command-id>:<zero-padded-ordinal>`. That pair is the durable event order; `audit.events.id`, insertion order, and equal transaction timestamps are never used as ordering evidence.

Audit insertion consumes the ordered event JSON with ordinality in one statement. Tests read events by command ID and order by numeric command ordinal. They assert the exact sequence and metadata, not merely a count or a sorted set of targets.

## Budgets and failure semantics

Statements include transaction control:

| Command                                 | 1 input | 100 inputs |
| --------------------------------------- | ------: | ---------: |
| Candidate assignment                    |       5 |          5 |
| Individual employee workbook            |       5 |          5 |
| Mixed individual/Combined Role workbook |       6 |          6 |

Statement growth is zero and never exceeds Ticket 3's six-statement ceiling. Combined request/response payload remains at or below 512 KiB. Validation, set-based writes, and audit insertion must not spill to temporary storage at the controlled staging fixture.

Any validation, uniqueness, lock, write-count, or audit failure rolls back domain state and all events. Retrying the same failed logical command is safe because nothing committed. Retrying after a successful command follows ordinary domain duplicate/lifecycle rules; it does not silently treat a new command ID as idempotency.

Sequential Recruitment Interview Round locks, question counts, assessments, Candidate Application closure, Approved Post lifecycle, vacancy counts, combined-role behavior, and employee-assignment workbook parsing remain behavior-oracle concerns and cannot change within this performance slice.

## Acceptance

Real-PostgreSQL contract tests cover 1, 100, and rejected 101 inputs; duplicate Candidate IDs; closed and active application cycles; concurrent active-application conflict; individual and Combined Role assignments; repeated target transitions; malformed/duplicate workbook rows; missing/inactive targets; and rollback after a late failure.

For every successful case they assert final domain state, row versions, exact ordered Recruitment Assignment Events, command IDs/ordinals, and statement/payload budgets. Failure cases assert unchanged domain fingerprints and zero command events. Existing Approved Post, application-cycle, workbook, vacancy, and interview-round suites remain green.

No manual UI test is required for this repository/domain contract. The later implementation slice needs only automated repository, action-boundary, and workbook-parser tests unless it changes visible workbook feedback.

## Current implementation blockers

- Neither public bulk command enforces the 100-input server boundary.
- `auditMany` assigns unrelated random `source_id` values and stores no command ID or ordinal. Although its insert uses JSON ordinality, the committed rows have no durable logical ordering key and share the transaction timestamp.
- Candidate audit construction follows PostgreSQL `RETURNING` order instead of reconstructing first-occurrence Candidate selection order.
- Current integration tests prove audit counts and sorted target membership, not event order, command identity, repeated-target transitions, or the 101-input rejection.
