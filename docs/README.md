# MRMPL documentation

Use this index before changing domain behavior or implementation conventions.

- [Codebase](./codebase/): implementation and architecture guidance.
- [Glossary](./glossary/): canonical business terms, lifecycle rules, formulas, and metrics.
- [Website Catalogue](./glossary/website-catalogue.md): included fields and Product Portfolio ownership.
- [Personal dashboard analytics](./glossary/dashboard-analytics.md): permission-aware metrics, charts, and calculated KPIs.
- [Golden UI patterns](./codebase/ui-golden-patterns.md): mandatory dashboard composition and visual semantics.
- [Access Administration](./codebase/access-administration.md): granular permission catalogue, coverage, enforcement, and exceptions.
- [ADRs](./adr/): durable architectural decisions.
- [Specs](./specs/): scoped delivery specifications.
- [Private GCS Artifacts](./specs/private-google-cloud-artifacts.md): issue #88 decisions; implementation underway, live cutover pending.
- [GCS configuration](./codebase/google-cloud-artifacts-setup.md): configured production federation, bucket settings, and environment values.
- [September performance refactor](./codebase/refactor-sept-26.md): fixed contracts, delivery slices, and verification checklist.

Update glossary definitions before consumers when business semantics change. Keep agent-only working notes in `memory/`, not here.
