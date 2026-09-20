# MRMPL documentation

Code is the implementation source of truth. Documentation is limited to
business semantics, architectural decisions, and operator procedures that code
cannot express clearly.

- `glossary/` — business terms, lifecycle rules, formulas, and metrics.
- `codebase/` — current architecture and implementation conventions.
- `adr/` — durable architectural decisions.
- `neon-upstash-staging-runbook.md` and `neon-upstash-recovery-runbook.md` —
  managed runtime operation and recovery.
- `railway-worker-deployment.md` — worker deployment.
- `local-file-storage-backup-restore.md` and
  `codebase/artifact-storage-migration.md` — active legacy-byte migration and
  recovery procedures.
- `data-classification-retention.md` and
  `pricing-source-retirement-exceptions.md` — unresolved retention constraints.

Do not store implementation plans, tickets, checklists, test results, migration
reports, or dated acceptance evidence here. Those belong in issues, pull
requests, or ignored handoff notes. Update glossary definitions before changing
their codebase consumers.
