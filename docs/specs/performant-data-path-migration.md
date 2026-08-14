---
title: Preserve business behavior while adopting the performant data path
status: ready-for-agent
target: staging
---

## Problem Statement

The actively developed staging codebase contains 32 commits of required Production Floor, quality, planning, recruitment, and commercial behavior, but it lacks the performant PostgreSQL access, cache discipline, dashboard delivery, worker wake-up, and bounded-query architecture of the performant reference snapshot.

Replacing files wholesale would lose business behavior. Blindly merging the trees would create conflicting schema histories, stale authorization, oversized PostgreSQL packets, N+1 operations, and inconsistent multi-instance behavior. The project needs the performant architecture without changing established business outcomes.

## Solution

Semantically integrate the performant architecture into the staging codebase while treating its existing behavior as the business oracle. Reconcile schema history first, then migrate dashboard projection and delivery, refresh scheduling, authorization, commercial reads, and recruitment bulk operations.

The migration will be accepted through externally observable behavioral parity, explicit PostgreSQL query and packet budgets, fresh-install and upgrade-path verification, and failure-mode tests. PostgreSQL remains authoritative; caches and notifications remain disposable accelerators.

## User Stories

1. As a Production Floor user, I want my existing floor-scoped dashboard behavior preserved, so that another Production Floor's data is never exposed.
2. As a Production Floor user, I want unchanged dashboards to transfer only version metadata, so that routine refreshes remain fast.
3. As a Production Floor user, I want changed dashboards delivered promptly, so that I do not wait for a polling interval.
4. As a Production Floor user, I want periodic fallback refreshes, so that missed live notifications self-heal.
5. As a Production Floor user, I want Production pauses to remain reversible, so that existing operational control is preserved.
6. As a Production Floor user, I want machine-plan detail retained per floor, so that planning remains accurate.
7. As a Production Floor user, I want first-piece tasks and reports to remain distinct, so that the existing workflow remains intact.
8. As a quality user, I want quality records isolated by Production Floor, so that floor boundaries remain correct.
9. As a planning user, I want planning records isolated by Production Floor, so that plans cannot leak across floors.
10. As a correction user, I want correction candidates refreshed efficiently, so that active correction work remains responsive.
11. As a dashboard user, I want source-coverage warnings when operational data is bounded, so that partial coverage is never mistaken for complete history.
12. As a dashboard user, I want every current dashboard category retained, so that performance work does not remove business information.
13. As an authenticated user, I want authorization changes to take effect on my next request, so that revoked access is not retained by process-local or cookie caches.
14. As an authenticated user, I want repeated authorization checks within one request deduplicated, so that correctness does not require redundant database reads.
15. As an administrator, I want authorization behavior consistent across application instances, so that access does not depend on which instance handles a request.
16. As a commercial user, I want enquiry lists to load within a bounded query budget, so that data growth does not degrade the page.
17. As a commercial user, I want design lists to load within a bounded query budget, so that attachments and related records do not create N+1 queries.
18. As a commercial user, I want sales candidates loaded in batches, so that list size does not multiply database round trips.
19. As an ECN user, I want quote and revision graphs loaded through shared batched queries, so that large change histories remain usable.
20. As a Customers user, I want existing pagination and navigation preserved, so that recent usability improvements survive the migration.
21. As a Products user, I want existing pagination and navigation preserved, so that recent usability improvements survive the migration.
22. As a commercial user, I want operational screens bounded with visible notices, so that response sizes remain predictable.
23. As an auditor, I want exports and explicit history views to remain complete, so that operational bounds do not discard historical access.
24. As a recruitment user, I want Approved Post lifecycle states preserved, so that vacant, appointed, occupied, resigned, and inactive posts behave as before.
25. As a recruitment user, I want combined-role behavior preserved, so that existing workforce modelling remains valid.
26. As a recruitment user, I want employee-assignment workbooks preserved, so that current assignment operations remain supported.
27. As a recruitment user, I want vacancy counts preserved, so that staffing visibility remains accurate.
28. As a recruitment user, I want job workspaces preserved, so that hiring work stays organized as it does today.
29. As a recruitment user, I want bulk candidate assignment to remain atomic, so that partial failures cannot leave inconsistent assignments.
30. As a recruitment user, I want bulk employee assignment to remain atomic, so that assignment workbooks cannot be partially applied.
31. As a recruitment user, I want bulk actions to use batched reads, writes, and audits, so that large operations do not create N+1 traffic.
32. As a recruitment user, I want repeat Candidate Application cycles preserved, so that returning candidates retain correct history.
33. As an interviewer, I want Recruitment Interview Rounds to remain sequentially locked, so that later rounds cannot begin prematurely.
34. As an interviewer, I want each round's five-question structure preserved, so that evaluation rules remain unchanged.
35. As an auditor, I want all required domain changes represented in audit evidence, so that batching does not reduce traceability.
36. As a worker operator, I want committed refresh jobs to wake workers immediately, so that dashboards update without aggressive polling.
37. As a worker operator, I want the durable refresh queue to remain authoritative, so that lost notifications cannot lose work.
38. As a worker operator, I want a safety sweep when notifications are unavailable, so that transient connection failures recover automatically.
39. As a database operator, I want dashboard reads to use narrow projections, so that PostgreSQL packets do not contain unrelated floors or complete prior models.
40. As a database operator, I want source collection executed through indexed, bounded statements, so that table growth does not cause unbounded scans or temporary writes.
41. As a database operator, I want published migrations retained unchanged, so that deployed environments share one valid schema history.
42. As a deployer, I want fresh-install and upgrade paths tested, so that new and existing environments reach the same schema.
43. As a maintainer, I want business rules owned by domain modules rather than presentation modules, so that all callers use one policy.
44. As a maintainer, I want explicit query, packet, latency, and freshness budgets, so that later regressions are detectable.
45. As a product owner, I want functional fingerprints identical before and after migration, so that performance changes cannot silently alter business logic.
46. As a product owner, I want deliberate bounded-result differences documented, so that approved performance constraints are distinguishable from regressions.

## Implementation Decisions

- The staging codebase remains canonical. The performant snapshot is a reference implementation, not a replacement tree.
- Published staging migrations remain immutable. The five performant migrations are adapted and renumbered after the current staging head as `0039` through `0043`.
- Schema-history reconciliation precedes runtime integration.
- Existing Production Floor, quality, planning, pause, first-piece, commercial, and recruitment invariants remain authoritative.
- Dashboard source data is materialized into an indexed projection with explicit per-category budgets and coverage metadata.
- Projection refresh retains every canonical source category and all later floor-specific source fields.
- Prior dashboard-state reads select only the required floor-specific machine-plan projection, never the complete prior JSON model.
- Dashboard state accepts a known version and omits payload data when that version remains current.
- Existing server-side Production Floor extraction remains mandatory.
- Server-Sent Events carry invalidation and version hints only. Clients retrieve canonical state through the dashboard-state contract.
- A 60-second safety refresh remains in place to recover from disconnected or missed event streams.
- Refresh jobs remain durable PostgreSQL records.
- Transactional PostgreSQL notifications are wake-up hints emitted with canonical writes; they never replace the durable queue.
- Workers use a session-capable listener connection and retain a 30-second safety sweep.
- Process-global authenticated-session and authorization-grant caches are removed.
- Authentication and complete grant loading are deduplicated only within one request.
- Cookie-based session caching remains disabled under ADR-0006 unless that ADR is explicitly amended.
- Redis remains optional acceleration. Redis loss cannot change authorization, canonical writes, or visibility of the newest committed dashboard model.
- Commercial repositories batch related attachments, candidates, quotes, and revisions.
- Operational commercial lists are bounded at the repository boundary and expose incomplete-coverage notices.
- Explicit exports and history operations remain paginated to completeness or otherwise exhaustive.
- Commercial search receives the performant category and trigram indexes.
- Recruitment bulk commands replace per-record reads, writes, and audit persistence with set-based or bounded-batch operations.
- Recruitment bulk commands preserve transactionality, validation, ordering, lifecycle rules, Candidate Application history, Recruitment Interview Round locks, and audit completeness.
- Recruitment policy currently duplicated in the presentation layer moves behind an exported recruitment domain interface.
- Oversized recruitment persistence responsibilities are separated by established domain concepts without changing public behavior.
- Existing pagination and navigation behavior for Customers and Products is merged with repository-level bounds rather than replaced.
- No whole-file transplant is accepted for semantically overlapping modules.
- Rollout is staged by subsystem and guarded by behavioral fingerprints plus performance budgets.

## Testing Decisions

- Tests assert externally observable contracts and budgets, not helper structure or source-code strings.
- The primary seam is a migrated-system behavioral contract. A production-like harness drives public application and repository workflows plus a worker cycle against real PostgreSQL from a fixed canonical dataset.
- The behavioral harness normalizes only volatile identifiers, timestamps, and approved derived-performance structures before comparing staging and migrated fingerprints.
- Behavioral scenarios cover Production Floor isolation, reversible pauses, quality, planning, first-piece separation, commercial history, Approved Post lifecycle, combined roles, workbooks, Candidate Application cycles, sequential Recruitment Interview Rounds, bulk atomicity, authorization outcomes, and audit effects.
- The PostgreSQL budget seam records statements, rows, and bytes at the shared client boundary using a real database.
- Dashboard-source collection targets one indexed statement; unchanged known-version responses omit payload and remain at or below 1 KiB; changed responses contain only the requested Production Floor.
- Request authorization targets at most one session read and one complete-grant read; revocation takes effect on the next request.
- Commercial query budgets target at most six statements for enquiries, five for design, six for sales, and six for the shared ECN graph.
- Recruitment bulk statement growth remains effectively constant from one to one hundred records while preserving atomic rollback and audit evidence.
- Operational lists prove their configured bounds and coverage notices; export and explicit history paths prove completeness.
- The worker performs no more than four idle safety-sweep statements per minute and still recovers from a lost notification.
- Wall-clock and execution-plan assertions run in a controlled benchmark job rather than timing-sensitive unit tests. Plans must avoid temporary writes on the audited paths.
- The migration-history seam applies the full schema to an empty PostgreSQL database and upgrades a representative database through staging migration `0038` before applying `0039` through `0043`.
- Migration-history verification requires prior migration names and checksums to remain unchanged, business fingerprints to survive, projections to backfill, and required indexes, triggers, and roles to exist.
- Dashboard tests cover floor isolation, unchanged and changed versions, coverage warnings, live invalidation, reconnects, and safety refresh.
- Refresh tests cover notification-after-commit, rollback, duplicate hints, listener loss, worker restart, and durable-queue recovery.
- Authorization tests cover same-request deduplication, immediate revocation, cross-instance behavior, Redis loss, and sensitive operations.
- Recruitment tests cover bulk assignment rollback, audit completeness, repeat applications, Approved Post statuses, and round locks.
- Existing dashboard view-model, authorization, commercial workflow, production shop-floor, recruitment, worker, and schema-contract suites are prior art.
- The audited targeted baselines of 74 staging tests and 29 performant optimization tests remain green before full lint, typecheck, test, build, migration, and benchmark gates.

## Out of Scope

- Redesigning Production Floor, quality, planning, commercial, or recruitment workflows.
- Changing Approved Post statuses, Recruitment Interview Round sequencing, question counts, Candidate Application semantics, or Production pause semantics.
- Replacing PostgreSQL as the system of record.
- Introducing a distributed cache as an authorization or business-state authority.
- Rebuilding the user interface except where bounded-result or connection-state feedback is required.
- Rewriting published migrations.
- Unrelated dependency upgrades, framework migrations, deployment changes, or visual redesign.
- Performance work outside the audited dashboard, authorization, worker, commercial, and recruitment paths.

## Further Notes

- The staging branch contains 32 commits beyond its prior mainline reference and changes 96 files.
- The performant snapshot changes 61 relevant files. Sixteen overlap semantically and require manual reconciliation; the remaining files still require behavior review before transplant.
- Five performant migration numbers collide with published staging migrations. This is the first and highest-risk integration seam.
- Reference measurements reduce an unchanged 5 MiB dashboard response to approximately 274 bytes, contains-search latency from approximately 443 ms to 3 ms, and dashboard-source latency from approximately 374 ms to 44 ms without temporary writes.
- Reference commercial workflows use approximately three to six statements rather than roughly one hundred to more than six thousand.
- Performance measurements are acceptance anchors. Controlled benchmarking decides final environment-specific thresholds before implementation slices are cut.
- The companion Wayfinder map holds unresolved decisions and produces the final independently reviewable implementation sequence.
