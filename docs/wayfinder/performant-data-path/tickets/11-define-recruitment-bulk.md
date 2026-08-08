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

- Keep `assignCandidates` and `bulkAssignEmployees` as the public command boundary and execute each command in one PostgreSQL transaction.
- Resolve and lock all eligible targets in bounded reads, validate the complete input before writes, derive ordered lifecycle transitions in memory, and persist posts, applications, and audit evidence with set-based statements.
- Preserve closed Candidate Application history, reject duplicate active applications, retain Approved Post and combined-role lifecycle behavior, and leave sequential Recruitment Interview Round enforcement unchanged.
- Own lifecycle and recruitable-post rules in the exported `@workspace/db/recruitment-domain` interface instead of presentation code.
- Hold statement growth constant from one to one hundred inputs: candidate assignment uses five statements for both sizes; employee workbooks use five statements for one individual assignment and six for a mixed one-hundred-row workbook.

## Evidence

- Commits: `f310aef`, `137067f`, `c42c429`.
- Real PostgreSQL coverage proves one-versus-one-hundred statement budgets, complete audit rows, combined-role fan-out, and atomic rollback.
- The recruitment contract seam passes 43 tests covering bulk operations, repeat application cycles, Approved Post lifecycle states, deletion blockers, and interview-round locks.
- DB lint, typecheck, and build pass; web typecheck and production build pass.
