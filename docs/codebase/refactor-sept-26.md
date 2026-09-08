# September 2026 performance and quality refactor

Working branch: `refactor/sept-26`. Pull request target: `staging`.
Starting commit: `d920a2c8f4e8ced37a14f4a4db4af775357f8e86`.

[Delivery checklist](./refactor-sept-26-checklist.html) records owners, acceptance evidence, and unfinished work. Keep the PR draft while work is incomplete. The user must explicitly authorize merging.

## Fixed contracts

This work must not change business logic: calculations, rounding, eligibility,
workflow transitions, permissions, floor isolation, historical records, imports,
exports, correction/reversal semantics, or planning decisions. Preserve exact
coverage counts, existing caps and ordering, durable writes, and browser filter
persistence. Recent master-permission changes in the starting commit are part of
the baseline. Performance is not grounds for weakening any of these contracts.

Tests that disagree with existing rules must be diagnosed against source and the
canonical glossary. Repair stale fixtures or assertions only with evidence; do
not change production rules or merely accept new snapshots to make tests pass.

## Delivery slices

1. Repair test-database isolation and development dependency resolution; classify
   baseline failures. Acceptance: suites cannot corrupt each other's schema and
   the configured development server renders without a launcher workaround.
2. Remove verified unused UI, actions, and test-only adapters. Acceptance: no
   reachable caller is removed; lint, types, and relevant behavior remain valid.
3. Optimize canonical source and correction queries. Acceptance: differential
   fixtures preserve selected records, order, exact coverage, reversal handling,
   caps, and floor isolation; row/byte/query-work measurements improve.
4. Replace overview-register loading with equivalent metrics and scope feature
   data to its consumer. Acceptance: metric values and access decisions match the
   existing implementation, including stock and date edge cases.
5. Assess refresh lock contention. The protocol rewrite is deferred: discarding
   dirty builds risks starvation, while durable claims require leases, fencing,
   crash recovery, and successor handoff. Optimize build queries within the
   existing transaction; do not claim that write blocking is eliminated.
6. Reduce shared table filtering work. Acceptance: faceting, natural sorting,
   empty cells, persisted filters, and filtered selection remain equivalent;
   browser checks cover repeated input, recovery, and narrow/light/dark views.
7. Separate runtime environment exports from worker/backup exports. Acceptance:
   web imports avoid command-only dependencies and all public consumers compile.
8. Preserve inferred planner types at existing mappings and remove redundant
   casts. Broader dashboard decomposition is deferred: moving shared helpers
   without a clear data boundary adds coupling rather than reducing it. Keep
   runtime expressions and planning output unchanged.
9. Assess derived-data retention. Do not delete history or choose a new retention
   policy unless existing contracts already permit it. Record any policy-dependent
   recommendation explicitly rather than presenting it as implemented.
10. Run complete checks, compare performance, and review the blast radius. Record
    any pre-existing failure separately from regressions introduced by this PR.

## Baseline evidence

The audit at `073dece` identified about 2,618 lines of unused UI; candidates must
be rechecked against the newer starting commit. Source reads returned 2,000 route
rows at 10k/100k/300k organization histories with raw query p95 approximately
13/123/608 ms. Corrections loaded 50k rows / 31 MB of parsed JSON for 200 results,
with p95 577 ms. An injected 500 ms refresh build delayed enqueue-and-commit by
508 ms, confirmed by PostgreSQL blocking-pid inspection. These are diagnostics,
not production acceptance results or normal rebuild duration measurements.

Measurements used disposable PostgreSQL 16, two CPUs, 1,536 MiB memory, local disk,
synthetic data, five warmups and thirty serial samples. Four-client measurements
used eight batches. PostgreSQL JIT configuration, storage, memory, and network
were not matched to Neon. No production provider configuration was changed.

The audit's web tests passed 726/727 and runtime tests 32/32. A database reset
helper omitted the store schema and invalidated subsequent migrations. Excluding
that suite exposed 27 assertion failures plus three setup failures. New staging
commits mean these are historical baselines, not current branch check results.

## Team and review

The coordinating engineer owns architecture, integration, review, and delivery.
Only one writer owns this checkout at a time. Implementation uses the requested
Sol/high role; UI work may use Astra/medium; independent read-only research uses
Terra/xhigh. Each handoff states owned files, acceptance criteria, evidence, and
remaining uncertainties. The coordinating engineer reviews every slice before
integrating it. No deployment or merge is authorized by this document.

## Reviewed query results

Fresh before/after samples on the unchanged local two-CPU fixture (five warmups,
thirty samples) preserve complete canonical DTOs and public correction results.

| Operation | Before p95 | After p95 |
| --- | ---: | ---: |
| Canonical reader, 10k source rows | 14.91 ms | 16.62 ms |
| Canonical reader, 100k source rows | 96.88 ms | 38.88 ms |
| Canonical reader, 300k source rows | 460.27 ms | 203.12 ms |
| Correction candidates | 433.66 ms | 45.43 ms |

Correction input falls from 50,000 rows / 31.06 MB to 4,000 rows / 2.43 MB;
the same 200 candidates are returned. Exact canonical coverage counts remain.
The small-fixture result did not improve; larger histories show the material gain.
These synthetic local results do not establish production latency. Existing source,
correction/reversal, and floor tests pass 40/40; DB types and lint pass.

## Other delivered improvements

- Removed 3,187 lines of unreachable forms, tile views, server actions, and their
  obsolete test references. Kept the live legacy analysis and catalog adapter.
- Overview data queries: Commercial 6 to 1; Store 4 to 1. Store repository input
  to the metrics loader fell from 216,873 to 101 JSON bytes on 300 synthetic
  items, with p95 4.52 to 1.85 ms. This is an internal payload measurement, not
  an HTTP response reduction. Selected Store-master reads fell from 10 to 1–6.
- Table cell values are parsed once per refresh and reused by discovery, facets,
  filtering, and sorting. The same 300-row category Apply used 4,810 DOM clones
  instead of 28,410 (83.1% fewer). Time inside clones was 4.1 versus 32.3 ms in
  single traces; this is not latency p95. Facet algorithm complexity is unchanged.
- Redis leaf exports avoid importing worker/backup dependencies into web auth
  and SSE. The production build no longer emits the backup/filesystem warning.
- Preserved inferred data-entry types through floor filtering, removing three
  redundant casts. Fixed disposable schema resets and the direct CSS dependency.
- Updated stale schema/role test expectations against existing migrations;
  production permissions remain unchanged. Worker CI now includes staging PRs.

## Final verification

Application changes reviewed through table commit `38ec94d`. Full production
`pnpm build` passes all five build tasks without warnings. Full `pnpm lint`
passes all six lint tasks with three existing React Compiler warnings. Relevant
DB, runtime, migration, UI, and web typechecks pass.

| Test package | Passing | Failing | Pending |
| --- | ---: | ---: | ---: |
| Web | 740 | 0 | 0 |
| Runtime | 32 | 0 | 0 |
| UI | 21 | 0 | 0 |
| Observability | 8 | 0 | 0 |
| Database | 391 | 26 | 16 |
| Migration | 34 | 1 | 0 |

The database and migration suites are **not green**. All remaining failing test
names and setup errors reproduced in a separate worktree at `5c2ae77`: staging
application code plus the disposable-test reset and CSS setup fix, before the
performance changes. Baseline DB results were 375 passing, 29 failing, 28 pending.
Two stale schema assertions and Store suite isolation were fixed; one new metric
equivalence assertion passes. A baseline artifact-ledger failure passed the final
run without changes to that code and is not claimed as a fix. Baseline web was
739/740; its stale initial-administrator expectation is corrected.

Remaining DB failures (repository files under `packages/db/src/`):

| Test file | Failing tests |
| --- | ---: |
| commercial-costing.integration.test.ts | 9 |
| commercial-reporting.integration.test.ts | 1 |
| commercial-revisions.integration.test.ts | 6 |
| commercial-workflow.integration.test.ts | 3 |
| dashboard-planning.integration.test.ts | 4 |
| dashboard-source-projection-migrations.test.ts | 1 |
| production-shop-floor.integration.test.ts | 1 |
| recruitment-bulk.integration.test.ts | 1 |

The two DB setup failures are `commercial-design-bounds.integration.test.ts`
(duplicate `file_links_current_target_idx`) and
`commercial-enquiry-bounds.integration.test.ts` (multiple commands in a prepared
statement), accounting for 16 pending tests. The migration behavior-parity oracle
fails with “Design must be complete before costing can start,” as on the baseline.
These failures need a separate correctness investigation; rules were not changed
to make tests pass. Local full reports remain at `/tmp/mrm-final-*-tests.json`
and `/tmp/mrm-staging-*-tests.json`; benchmark/browser evidence is summarized here
and in the checklist because temporary artifacts are not durable project records.

Browser checks cover Store table facets, natural sorting, repeated Apply, persisted
filters, filtered selection, no-match recovery, desktop/narrow layouts and both
themes. Selected Store masters preserve category rows, item classification choices,
supplier-price item references, and read-only redirect/no-edit behavior using
explicit synthetic permissions. Unchanged transactional submissions and other
application workflows were not exhaustively exercised.

Worker CI and Vercel checks are linked from [PR #70](https://github.com/ronitmrm/mrm-dashboard/pull/70).
No production provider configuration or live data was changed. The PR remains
unmerged pending the user's explicit greenlight.

## Recommendations requiring a separate decision

- Redesign refresh ownership only with an explicit crash-recovery and fencing
  contract; do not replace the current lock with discard-on-dirty publication.
- Establish a retention policy before pruning derived history or previous-plan
  continuity. No history is deleted by this PR.
- Split the dashboard around typed consumer boundaries in separately reviewed
  slices. Moving helpers alone does not justify the churn or solve coupling.
- Diagnose the baseline correctness failures above and existing compiler
  memoization warnings independently; neither was hidden by this refactor.
