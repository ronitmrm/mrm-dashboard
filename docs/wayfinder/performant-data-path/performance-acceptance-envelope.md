# Performant data-path acceptance envelope

Date: 2026-08-08  
Target: controlled staging benchmark and production-like behavioral harness

## Measurement contract

Correctness gates run first. Performance cannot excuse a fingerprint, authorization, audit, ordering, atomicity, coverage, or completeness failure.

The controlled benchmark uses a restored production-like dataset in the target region, PostgreSQL fixed at 1 compute unit, four concurrent clients, five warm-up samples, and 30 measured samples. Report p50, p95, p99, maximum, statements, rows, request/response bytes, plan nodes, shared/local/temp blocks, WAL, and pool waiters. Latency gates use p95; freshness additionally gates p99. Cold starts and scale-from-zero are reported separately and do not contaminate warm-query measurements.

Packet bytes are measured at the shared PostgreSQL client boundary and at HTTP serialization. PostgreSQL statement, row, execution-time, and temporary-block evidence comes from instrumented clients plus `pg_stat_statements`; plans use `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)` in the isolated benchmark database. PostgreSQL documents the relevant [`pg_stat_statements` counters](https://www.postgresql.org/docs/16/pgstatstatements.html).

## Hard budgets

The machine-readable values live in `config/managed-staging.json`.

| Seam                        | Budget                                                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard source collection | 1 statement; p95 database execution ≤100 ms; response rows respect every category cap; database response ≤8 MiB                                                              |
| Dashboard state             | 1 statement; unchanged HTTP response ≤1 KiB and p95 ≤250 ms; changed one-floor response ≤2 MiB and p95 ≤750 ms                                                               |
| Authorization               | Per request: ≤1 session read and ≤1 complete-grant read; database p95 ≤50 ms; revocation has zero cross-request grace                                                        |
| Commercial enquiries        | ≤6 statements                                                                                                                                                                |
| Commercial design           | ≤5 statements                                                                                                                                                                |
| Commercial sales            | ≤6 statements                                                                                                                                                                |
| Shared ECN graph            | ≤6 statements                                                                                                                                                                |
| Commercial latency/packet   | Each audited database workflow p95 ≤250 ms; contains-search p95 ≤25 ms; repository response ≤1 MiB; rows never exceed the configured operational cap plus one coverage probe |
| Recruitment bulk            | One and 100 inputs each use ≤6 statements, statement growth ≤1, database p95 ≤500 ms, combined request/response ≤512 KiB                                                     |
| Idle worker                 | 30-second safety sweep and ≤4 PostgreSQL statements per idle minute                                                                                                          |
| Plans                       | 0 temporary blocks written; no external-disk sort/hash; no sequential scan of an audited high-volume relation once the benchmark relation has at least 10,000 live rows      |

The dashboard source byte ceiling protects the database boundary while category caps are calibrated. The stricter 2 MiB changed-response ceiling requires a material improvement over the approximately 5 MiB reference payload without pretending every floor has identical data. Any cap adjustment requires measured evidence and a map amendment; it is not a silent implementation choice.

The 2026-08-09 local imported-source calibration sets the `cycle`, `route`, and
`tooling` data-entry caps to 500 records per floor. With 4,011, 4,007, and 4,010
available Conventional records respectively, the former 2,500-record caps
produced a 4,102,646-byte floor payload. The 500-record caps produce a
1,742,535-byte floor payload and explicit per-category coverage facts for all
three truncated collections. The cap-and-coverage integration gate fixes these
values; a later change requires the same measured amendment.

## Freshness and polling

- committed write to worker claim: p95 ≤2 seconds and p99 ≤5 seconds while the listener is healthy;
- committed write to published canonical read model: p95 ≤10 seconds and p99 ≤30 seconds;
- lost notifications or listener connection: durable work is discovered by the next 30-second safety sweep;
- SSE invalidation hint to completed canonical refetch: p95 ≤2 seconds;
- browser safety refresh: every 60 seconds while visible, paused while hidden;
- active refresh-status polling may run every second only while a durable refresh is known to be active;
- authorization revocation applies on the next request, regardless of Redis state or application instance.

## Coverage and completeness gates

Every bounded query returns `returned`, `available`, `limit`, and `truncated` (or an equivalent typed contract). Search/filtering occurs before the limit. A benchmark fixture contains at least `limit + 1` matches for every bounded collection and proves the coverage transition. Explicit exports and history iterate to completeness and match the canonical fingerprint; their total work may scale with exported rows, but each page must obey the packet and statement envelope.

## Failure rules

A run fails when any hard maximum is exceeded, a p95/p99 target is missed, a required metric is absent, the plan spills, pool waiters appear, the dataset is smaller than its required cardinality, or a correctness fingerprint differs. Reported medians cannot hide a tail-budget failure. Results from developer laptops are diagnostic only; release evidence comes from the controlled staging benchmark.
