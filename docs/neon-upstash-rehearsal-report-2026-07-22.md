# Neon transfer rehearsal report

Date: 2026-07-22  
Authority: non-production targets only

## Frozen source

The local PostgreSQL 16 source applied all 28 checked-in migrations before the
dump. It contained 144 tables and 164,156 rows. The exact aggregate fingerprint
was:

`1a57aec90842cb976ed106491b0e315e7a3f769e739c586cd9a0ed76f2eeef60`

There were 272 migration validations with zero failures, one Better Auth user,
one account, eleven sessions, zero pending/running refresh jobs, and zero
pending/retrying outbox rows. Attachment tables contained no rows, so file-byte
transfer was an explicit no-op; the separate file backup runbook remains the
authority when attachments exist.

## Artifacts

| Rehearsal | Custom dump checksum                                               |                  Size | Dump time |
| --------- | ------------------------------------------------------------------ | --------------------: | --------: |
| 1         | `948c5bd54b7d8501fb516d749d26ec09737b8c06c2e07f7ee6d085fdd67aac48` | approximately 15.2 MB |    2.07 s |
| 2         | `dcde17419b5f4071d75ccf5b518365816df1e189f2cf22ecf14950b826a3dbc1` |      15,213,305 bytes |    2.14 s |

The ignored artifacts remain below
`.scratch/neon-upstash-deployment/rehearsals/`. No dump contains provider
credentials.

## Restore method

The runner could not reliably reach Neon over raw PostgreSQL TCP. The custom
dump remained the source artifact; SQL was emitted with PostgreSQL 16 tools and
executed through Neon's embedded TLS-capable client. Rehearsal 2 used a single
transaction for the data-only restore and completed in 680.33 seconds.
Rehearsal 1 completed successfully but its final end-to-end duration was not
captured precisely and must not be used for maintenance-window planning.

The transfer helper suspended only repository-owned foreign keys and user
triggers, loaded data, recreated 495 foreign keys as `NOT VALID`, validated all
of them, and re-enabled every user trigger. It did not weaken unrelated
provider or system objects.

## Exact result

Both retained rehearsal branches independently matched:

- 11 canonical schemas;
- one `pgcrypto` extension;
- 144 base tables, 412 indexes, 960 constraints, and 10 routines;
- 495 validated foreign keys and zero disabled user triggers;
- 164,156 rows, zero table mismatches, and the exact source fingerprint;
- all 28 migration names/checksums;
- identity counts of 1 user, 1 account, and 11 sessions;
- zero active refresh jobs and zero pending/retrying outbox rows;
- positive web/worker/reporting privileges and all tested negative boundaries.

The populated rehearsal state was promoted into the non-production `staging`
branch with the previous empty staging state preserved as a rollback branch.
Immediately after promotion, staging again matched all 144 tables, 164,156
rows, zero mismatches, and the frozen digest. A later, explicitly recorded
empty-Redis acceptance refresh changed only derived staging state.

## Provider policy observations

Neon staging is PostgreSQL 16 in a US-East region class with 0.25-to-1 CU
autoscaling, provider-default suspend behavior, and six hours of history.
Branch protection is unavailable on the current plan. Upstash staging is a
free hard-capped database in a US-East region class with eviction disabled;
auto-upgrade and spend-budget controls are unavailable on that plan.

These limitations are acceptable for non-authoritative staging only.
