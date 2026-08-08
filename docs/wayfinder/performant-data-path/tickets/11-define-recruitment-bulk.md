---
title: Define the Recruitment Bulk-Operation Contract
label: wayfinder:grilling
status: resolved
claim: codex
blocked_by:
  - Lock the Behavior-Parity Oracle
  - Set the Performance Acceptance Envelope
---

## Question

Which bulk reads and writes may be set-based while preserving atomicity, audit ordering, Candidate Application cycles, Recruitment Interview Round locks, duplicate handling, Approved Post rules, and failure semantics?

## Resolution

- Adopt the [Recruitment bulk-operation contract](../recruitment-bulk-contract.md).
- Keep `assignCandidates` and `bulkAssignEmployees` as 1–100 input, single-transaction command boundaries. Validate and lock the complete selection, derive ordered transitions, then persist set-based state and audit evidence atomically.
- Preserve Candidate Application cycles, duplicate-active rejection, Approved Post and Combined Role lifecycle, workbook row semantics, and Recruitment Interview Round locks behind the exported `@workspace/db/recruitment-domain` policy.
- Persist a command ID and ordinal for every Recruitment Assignment Event. Candidate events follow first-occurrence selection order; workbook events follow row then Combined Role fan-out order. Random UUID/insertion/timestamp order is not evidence.
- Hold statement growth constant: Candidate assignment uses five statements for 1 and 100 inputs; employee workbooks use five for individual-only and six for mixed 100-row input.

## Prior evidence and remaining gaps

- Commits: `f310aef`, `137067f`, `c42c429`.
- Real PostgreSQL coverage proves one-versus-one-hundred statement budgets, audit membership/count, Combined Role fan-out, and atomic rollback.
- The recruitment contract seam passes 43 tests covering bulk operations, repeat application cycles, Approved Post lifecycle states, deletion blockers, and interview-round locks.
- DB lint, typecheck, and build pass; web typecheck and production build pass.
- Those tests do not yet prove durable audit order or the 100-input server cap. The contract records both as implementation blockers; prior evidence must not be read as acceptance of random audit UUID order.
