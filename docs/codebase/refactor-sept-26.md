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
8. Split dashboard responsibilities and narrow planner types at existing seams.
   Acceptance: unchanged routes, permissions, visible workflows, calculations,
   and planning output; no new framework or speculative abstraction.
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
