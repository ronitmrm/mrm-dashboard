# Performant data-path behavior-parity contract

Date: 2026-08-08  
Scope: staging behavior that the migration must preserve

## Oracle and comparison seam

The staging application at migration start is the business oracle. The highest acceptance seam is a production-like behavioral contract that drives public application and repository workflows, plus a complete worker cycle, against a fixed canonical PostgreSQL dataset. It compares normalized before/after fingerprints rather than internal helper calls or SQL text.

Normalization may remove only generated identifiers, timestamps, provider-specific plan costs, and approved performance metadata. It may not reorder business collections, erase audit events, collapse lifecycle states, or omit floor, organization, permission, history, or failure details. Any new bounded operational response is compared as its rows plus coverage metadata; its exhaustive export or history counterpart is compared in full.

## Required scenarios

| Domain            | Observable contract                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production Floor  | Conventional, CNC, and Forging state remains isolated; floor selection never returns another floor's machine plans, quality data, planning data, or first-piece records. Production pauses remain reversible. Machine-plan detail and established schedule ordering remain intact. First-piece tasks and completed reports remain distinct.                                              |
| Dashboard         | Every existing source category remains represented. Initial, changed-version, unchanged-version, stale, and failed states remain distinguishable. A changed response contains only the requested floor. An unchanged known version may omit the payload. Bounded categories include visible coverage facts.                                                                              |
| Refresh           | A committed canonical write leaves durable refresh work. Rollback leaves neither canonical effects nor a usable notification. Duplicate hints are harmless. Listener loss, worker restart, and Redis loss recover from PostgreSQL authority.                                                                                                                                             |
| Authorization     | Authentication result, complete grants, navigation, and sensitive-operation decisions match the oracle. Revocation applies on the next request and across instances. Redis loss does not grant access. Authorization changes retain their audit effects.                                                                                                                                 |
| Commercial        | Enquiry, design, sales, costing, order, quote, revision, correction, customer, product, drawing-history, and website-product outcomes remain equal. Related attachments, candidate membership, quote/revision graphs, pagination, navigation, search semantics, and meaningful repository ordering remain intact. Operational bounds never alter exhaustive exports or explicit history. |
| Recruitment       | Approved Post lifecycle states, vacancy counts, combined roles, job workspaces, repeat Candidate Application cycles, sequential Recruitment Interview Round locks, five-question rounds, and employee-assignment workbooks remain equal. Candidate and employee bulk assignment remain atomic.                                                                                           |
| Audit and failure | Every required domain effect produces the same event type, subject, actor, before/after meaning, and deterministic input order. Validation, authorization, conflict, missing-record, and infrastructure failures preserve status/error class and leave no partial canonical or audit writes.                                                                                             |

The fixed dataset must include all three Production Floors; active and paused work; quality, planning, and first-piece examples; allowed and revoked users; commercial collections above each operational limit; complete attachment and ECN graphs; every Approved Post state; combined roles; repeat candidates; locked and unlocked interview rounds; valid and invalid bulk workbooks; and pending, duplicate, retrying, and completed refresh work.

## Ordering rules

The fingerprint preserves order where users or downstream files observe it: Production Floor and dashboard category order; machine-plan schedule order; commercial relevance/recency plus stable tie-breakers; customer and product pagination order; ECN graph order; workbook row order; sequential interview rounds and questions; bulk input order; and audit event order. Collections defined as sets are canonicalized by their documented business key before comparison.

## Explicitly allowed visible differences

Only these migration effects are allowed without a business-spec amendment:

1. Unchanged dashboard reads may return version/status metadata without the dashboard payload.
2. Live invalidation may make committed dashboard changes visible sooner; the existing safety refresh remains.
3. Operational commercial and dashboard collections may be bounded only at a named repository boundary, with visible returned/available/limit coverage. Search applies before the bound. Exports and explicit history remain exhaustive.
4. Connection, stale, retry, and partial-coverage indicators may be added where the new delivery contract requires them.
5. Volatile performance metadata, delivery timing inside the accepted freshness envelope, and provider plan-cost values may differ.

Everything else is a parity failure, including silent truncation, changed lifecycle transitions, changed order, missing audit evidence, cross-floor leakage, stale authorization, or weakened atomicity.

## Acceptance evidence

The parity gate consists of:

- one committed canonical fixture and versioned normalized fingerprint;
- real-PostgreSQL workflow execution through public repositories/application handlers and one worker cycle;
- before/after fingerprint equality, plus explicit assertions for the allowed bounded and unchanged-version differences;
- atomic rollback checks for each bulk or multi-write workflow;
- audit count, ordering, and content checks;
- failure injection for listener, Redis, worker restart, authorization revocation, invalid workbook rows, and transaction rollback;
- focused prior-art suites for dashboard read models and planning, production shop floor, quality/workforce, authorization, commercial workflows and revisions, recruitment bulk/interviews, durable refresh, API delivery, workbooks, and pagination.

Unit tests remain useful diagnostics, but cannot independently satisfy the parity gate.
