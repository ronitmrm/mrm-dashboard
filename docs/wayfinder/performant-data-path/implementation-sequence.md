# Canonical performant-data-path implementation sequence

Date: 2026-08-08  
Starting point: PR #1, branch `agent/performance-migration-spec`  
Destination: staging; production promotion remains separately approved

## How to use this sequence

The current PR contains useful candidate implementation commits created before all contracts were fixed. They are prior art, not acceptance evidence. Keep the history intact for now and correct it with the green commits below. Reordering, squashing, splitting, or force-pushing the PR requires a later explicit review decision.

Each numbered row is one commit. It must leave the branch green at its listed seam. A review boundary is approved only after every commit in it passes its automated evidence; the two visible-UI boundaries additionally stop for the user's manual acceptance.

The local Wayfinder map remains the tracker, so this plan is not duplicated into a GitHub issue.

## Review boundaries

| Boundary | Scope                                                                   | Depends on   | Acceptance owner                                |
| -------- | ----------------------------------------------------------------------- | ------------ | ----------------------------------------------- |
| A        | Behavior oracle, unpublished migration reconciliation, shared telemetry | Decision map | Automated evidence                              |
| B        | Dashboard projection, durable wake-up, canonical state API              | A            | Automated evidence                              |
| C        | Dashboard browser delivery and status presentation                      | B            | Automated evidence, then user UI acceptance     |
| D        | Request-scoped authorization                                            | A            | Automated evidence                              |
| E        | Commercial repositories, graphs, exports, and history                   | A            | Automated evidence                              |
| F        | Commercial coverage/search presentation                                 | E            | Automated evidence, then user UI acceptance     |
| G        | Recruitment bulk commands and ordered audit evidence                    | A            | Automated evidence                              |
| H        | Integrated parity, managed benchmark, staging canary, recovery          | B–G          | Automated evidence plus recorded operator gates |

Boundaries are independently reviewable and promotable units even if they remain in one pull request. No boundary combines unrelated business changes. Old application artifacts must remain compatible with each additive schema state.

## Commit sequence

### Boundary A — oracle, schema, and telemetry

1. `test: capture performant migration oracle`
   - Add the fixed production-like dataset, deterministic normalization, and versioned staging fingerprint covering every Behavior-Parity Contract scenario.
   - Include cap + 1 commercial/dashboard data, all Production Floors, refresh failures, authorization revocation, complete ECN graphs, every Approved Post state, repeat applications, and valid/invalid workbooks.
   - Evidence: the fixture produces the same fingerprint twice; volatile IDs/timestamps normalize while business order, audit order, coverage, and failures remain observable.

2. `perf: add commit-scoped refresh notification`
   - Add the transaction-scoped refresh-job notification trigger/function to the still-unpublished dashboard migration, update its checksum, and prove commit delivery, rollback silence, duplicate hints, and bounded payloads on real PostgreSQL.
   - Evidence: empty-install and `0038` upgrade rehearsals pass; all published `0001`–`0038` checksums remain unchanged.

3. `perf: complete commercial candidate indexes`
   - Reconcile the still-unpublished commercial migration with the exact Sales candidate predicates for quote number/customer part code while retaining item, drawing, website, and category access paths.
   - Evidence: schema rehearsal passes; 10,000-row plans use the declared indexes, write zero temporary blocks, and satisfy the 25 ms controlled-search gate.

4. `feat: emit operation telemetry`
   - Add the shared structured `performance.operation`, `authorization.request`, and `redis.acceleration` contracts at database/HTTP boundaries without logging secrets, business payloads, user identity, or grants.
   - Evidence: unit tests assert stable event fields and byte/statement accounting; existing calls return identical business results; missing telemetry fails the benchmark harness.

Toolchain commits `6cb74fa` and `371eea2` are outside the business migration. Before Boundary A approval, reviewers either accept them as separately justified test/build prerequisites or move them to a dedicated PR. They do not inherit approval from this plan.

### Boundary B — projection, wake-up, and canonical Dashboard state

5. `fix: publish per-floor projection coverage`
   - Make every canonical source category report returned, available, limit, and truncated facts per Production Floor while preserving every existing dashboard category and floor field.
   - Evidence: one source statement; cap/cap + 1 fixtures for every category/floor; no cross-floor rows; changed model fingerprint differs only by approved coverage metadata.

6. `perf: narrow dashboard carry-forward reads`
   - Restrict previous-model access to the six contracted machine-plan fields and remove all complete prior-payload reads from refresh construction.
   - Evidence: selected-column/packet instrumentation proves the narrow boundary; planning stability, pause behavior, and Production Floor fingerprints remain equal.

7. `feat: own the direct refresh listener`
   - Add the dedicated direct-TLS PostgreSQL listener session, strict listener URL validation, `LISTEN` registration, immediate post-registration reconciliation, reconnect backoff, and clean shutdown.
   - Evidence: notification-after-commit, rollback, missed hint, connection loss, failover-style reconnect, duplicate hint, and worker restart tests pass against real PostgreSQL.

8. `perf: bound refresh safety sweeps`
   - Replace steady one-second polling with the 30-second two-probe safety sweep; keep one-second status polling only for known pending/running browser refreshes.
   - Evidence: healthy idle worker executes at most four statements/minute; lost notifications recover by the next sweep; liveness/readiness adds zero statements.

9. `feat: emit worker listener telemetry`
   - Emit `worker.listener` on transitions and aggregate `worker.sweep` once per minute from normal sweep results; expose process-local liveness and cached readiness.
   - Evidence: retained JSON contains every rollout field; telemetry survives simulated reconnect/retry paths; no extra status query appears in the statement trace.

10. `fix: align canonical dashboard state`
    - Align repository, authenticated route, and normalization boundary with one requested floor, known-version omission, monotonic version handling, refresh status, and typed coverage.
    - Evidence: one statement; unchanged response at most 1 KiB; changed response contains one floor and stays within 2 MiB; authorization/floor-isolation tests pass.

Boundary B review runs the projection, repository, route, runtime listener/sweep, production-planning, and Behavior-Parity Contract subsets. It does not start UI acceptance.

### Boundary C — Dashboard browser delivery

11. `feat: model dashboard delivery states`
    - Implement the independent connection, payload, canonical-request, durable-refresh, coverage, and visibility state machine proven by the Ticket 9 prototype.
    - Evidence: reducer tests cover initial/unchanged/changed responses, hints, disconnect, reconnect refetch, stale errors, durable refresh, visibility, late prior-floor responses, and no overlapping fetches.

12. `feat: render resilient dashboard delivery`
    - Connect SSE hints to canonical refetch, keep same-floor content through reconnect/retry, clear on floor change, show stale/refresh/failure/coverage text, and enforce visible-tab 60-second safety refresh.
    - Evidence: route/browser automation passes performance and state scenarios; web test/typecheck/build pass.
    - Review stop: ask the user to test the supplied preview with exact account, URL, seed state, actions, expected visual text, keyboard steps, and screen-reader announcements. Do not advance on automated evidence alone.

### Boundary D — authorization

13. `test: prove next-request authorization freshness`
    - Complete public-boundary tests for same-request session/grant deduplication, immediate next-request revocation, cross-instance behavior, Redis loss, disabled cookie caching, and sensitive writes.
    - Evidence: at most one session plus one complete-grant read per request, zero cross-request grace, identical outcomes across instances, and no authorization data in Redis. Amend implementation only inside this commit if a test exposes a gap.

### Boundary E — Commercial data paths

14. `refactor: paginate commercial masters at repositories`
    - Preserve Customer 15-row and Product 25-row navigation with exact totals; move Customer pagination into SQL and replace complete Customer/Product selector loads with 50-result server search.
    - Evidence: 0, exact-page, next-page, invalid-page, search-before-page, and stable UID/ID order tests pass.

15. `perf: bound enquiry reads and complete exports`
    - Return typed 200-root coverage for Enquiries/Technical review, batch all related rows, and implement exhaustive enquiry-register/line export routes in stable 500-row keyset batches.
    - Evidence: at most six statements, 1 MiB repository response, exact cap transitions, complete cap + 1 export fingerprint, and preserved enquiry workflow ordering.

16. `perf: bound design reads and relations`
    - Bound Design roots to 200, retain business priority order plus stable ID, batch complete attachments/BOM children for returned roots, and search portfolio products on demand.
    - Evidence: at most five statements, no N + 1 growth, complete returned-root children, coverage metadata, and unchanged Design workflow fingerprint.

17. `fix: preserve sales candidate rank and coverage`
    - Keep exact-part match then sent/updated recency order through the batched query, probe 51/return 50 per item, expose per-item coverage, and add server-backed candidate search.
    - Evidence: single-item and batched result order is identical; old eligible quotes remain selectable through search; the complete operation stays within six statements.

18. `perf: bound sales operational sections`
    - Apply typed 200-root coverage independently to clarification, handover, quote-ready, enquiries, and follow-ups; retain the explicit 50-enquiry sent-quote summary and each section's business order.
    - Evidence: every section proves cap/cap + 1 and uses a truthful section-specific coverage label; due-date queues are never described as “newest.”

19. `perf: share the exhaustive ECN graph`
    - Route both affected-price reads and decision writes through the same complete six-statement graph; remove recursive per-node quote/component reads while preserving cycle/depth validation.
    - Evidence: nested and branching ECNs produce identical prices/decisions/order, ≤6 statements, atomic rollback, and complete audit evidence.

20. `feat: complete commercial history surfaces`
    - Implement every advertised Sales, follow-up, sent-quote, Pricing, Purchase Order, master, drawing, and website history/export route as an exhaustive snapshot or navigable complete history.
    - Evidence: all advertised links resolve; cap + 1 and multi-batch exports match canonical fingerprints; no export accepts an operational cap.

Boundary E review is repository/route-only. Existing UI may consume the typed results only after this boundary is green.

### Boundary F — Commercial presentation

21. `feat: render commercial coverage and search`
    - Show a section-specific status notice for every truncated operational collection, connect repository-backed selectors/search, and link only to proven complete history/export paths.
    - Evidence: component/browser tests cover complete/truncated/error/search states and preserve Customer/Product navigation; web test/typecheck/build pass.
    - Review stop: ask the user to test the supplied preview with seeded cap + 1 results, exact pages/queries/actions, expected notices, keyboard navigation, and export downloads.

### Boundary G — Recruitment bulk contracts

22. `fix: cap recruitment assignment commands`
    - Enforce the 1–100 server boundary before opening a transaction for Candidate and employee assignment while preserving duplicate Candidate first occurrence and workbook row validation.
    - Evidence: 1/100 succeed, 0/101 fail without database work, request/response stays within 512 KiB, and existing lifecycle/workbook tests pass.

23. `fix: persist ordered recruitment assignment events`
    - Generate one command ID, reconstruct Candidate events in selection order, order workbook fan-out by row/primary/post code/ID, and persist deterministic command ordinal metadata/source IDs in one audit statement.
    - Evidence: exact event sequence—not sorted membership/count—passes for Candidates, repeated workbook targets, and Combined Roles; late failure leaves zero command events; one/100 statements remain 5/5 or 5/6.

No manual UI test is required for Boundary G unless visible workbook feedback changes.

### Boundary H — integrated acceptance and staging canary

24. `test: prove migrated behavior parity`
    - Run the complete candidate artifact against the canonical fixture and compare it with the captured staging fingerprint, allowing only the five documented visible differences.
    - Evidence: all domain/failure/audit/order fingerprints match; full `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass against real PostgreSQL.

25. `test: record managed staging envelope`
    - Record redacted controlled-staging p50/p95/p99, statements, rows, packets, plans, temporary blocks, freshness, pool waiters, listener recovery, and coverage/export evidence for the exact immutable artifacts.
    - Evidence: every hard Ticket 3 threshold passes; missing metrics fail the record; preview artifacts are promoted without rebuilding.

26. `docs: record staging canary and recovery evidence`
    - Record schema checksums/head, artifact IDs/digests, redacted environment inventory hash, worker host/listener readiness, manual UI acceptances, observation windows, Redis-empty recovery, listener-loss recovery, and last-good rollback identifiers.
    - Evidence: every rollout gate links to retained evidence; no failed/retrying work or pool waiters remain. This commit authorizes staging completion only, never production promotion.

## Exact automated gate commands

Focused commits run the smallest applicable subset, then each review boundary runs:

```sh
pnpm --filter @workspace/migration test
pnpm --filter @workspace/db test
pnpm --filter @workspace/runtime test
pnpm --filter web test
pnpm lint
pnpm typecheck
pnpm build
```

Schema commits additionally run the empty-install and representative `0038` upgrade rehearsal against real PostgreSQL. Boundaries A, B, E, G, and H require real-PostgreSQL integration tests; mocks alone do not satisfy them. Boundary H runs the canonical parity and controlled managed-staging benchmark commands introduced by commits 1 and 25.

Local services are stopped with retained volumes after the final local gate. Provider preflight, schema application, preview promotion, rollback, PITR, and any other external mutation remain explicit staging-operator actions under the runbooks.

## Current candidate-commit reconciliation

The following existing commits need follow-up evidence or correction before their boundary can be accepted:

- `7c5d410`: source bounding exists, but per-category/per-floor coverage and six-field carry-forward remain incomplete;
- `bf48707`: steady one-second polling and reconnect behavior conflict with the delivery/wake-up contracts;
- `fda6ac1`: batched Sales candidates silently cap and lose match/recency presentation order;
- `4886332`: only two Sales lists expose a generic notice and complete export routes are absent;
- `ce3a75a`: affected-price reads share a graph, but ECN decision writes still recurse per node;
- `f310aef`: audit insertion is batched, but committed events lack durable command order;
- `137067f`: employee writes are set-based, but the 100-input server cap and ordered-event assertions are absent.

Authorization commit `dfa3f2` and the schema/dashboard-state/SSE commits remain candidates pending their contract gates. Prototype commit `f47be17` stays on its throwaway branch and is not merged into production history.

## Out of scope

- changing business workflows, statuses, floor rules, audit meaning, or error classes;
- modifying published migrations `0001`–`0038` or destructive down migrations;
- making Redis/notifications authoritative;
- unrelated dependency, runtime, visual-design, or platform modernization;
- production deployment or data restoration without separate business approval.
