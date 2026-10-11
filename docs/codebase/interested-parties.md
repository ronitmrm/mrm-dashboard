# Interested parties requirements

`document_control.interested_party_requirements` owns the relevance decision and
monitoring plan. `interested_party_monitoring` retains submitted observations and
QA decisions with the then-current plan snapshot. `plan_revision` changes when
the plan is edited; `version` also protects concurrent monitoring/QA operations.
The latest verified review remains historical after a plan change. An earlier gap
stays visible until later verified monitoring meets the requirement.

Repository: `packages/db/src/interested-parties.ts`; routes:
`/iso-document/interested-parties` and `[id]`. Read/manage/verify permissions are
separate; base read is assigned records, read_all covers the register, and
assigned staff can submit monitoring.
Routes/actions require an interested-parties grant. All records, review joins
and writes are organization-scoped. No deletion API.
Canonical lifecycle: [ISO documents](../glossary/iso-documents.md).

Migration 0214 imports the supplied historical workbook rows as Draft. Source
status/date/text remain visible; no verification, owner or schedule is inferred.
QA resolves duplicated/ambiguous requirements by scope and documented plan edits.
Source N/A and conflicting delivery expectations remain unassessed.

Record PDF uses PDFKit and the shared attachment viewer. Excel exports contain
requirements, checks, plan snapshots and original source; the single-record
export adds `Change History` (`History` is reserved by Excel). The shared
`IsoRecordHistoryTable` also serves management reviews. History tables remount
when a new leading row arrives so the canonical table keeps newest entries first
while retaining its persisted column filters.
