# ISO document control implementation

Domain contract: [ISO Document](../glossary/iso-documents.md). The existing
`branding.documents` and `branding.revisions` records remain the only authoring
and immutable-PDF source. Migration 0170 deepens them with control metadata and
workflow state instead of creating a second document store.

## Boundaries

- `packages/db/src/document-control-domain.ts` owns classifications, frequency
  modes, metadata validation and MRM-QA/revision display formatting.
- `packages/db/src/branding.ts` owns master-list reads, dossier reads, metadata
  writes, department-scoped decisions, final release, monitoring confirmations
  and audit writes. All state transitions run under row locks.
- `/iso-document/documents` is the signed-in metadata index. Released and pending
  documents are separate views over the same records; Excel filters persist
  through `OperationalTable` and export uses the same released dataset.
- `/iso-document/documents/[id]` is the dossier. It composes control metadata,
  revision history, transaction history, record locations and on-demand
  monitoring. Document Templates remain the structured/upload authoring UI.

## Authorization and content

Index metadata is available to every signed-in user. Control actions use separate
capabilities: `iso.documents.manage`, `.approve`, `.release` and `.monitor`.
The seeded Quality Assurance HOD role gets manage/release/monitor and the existing
template permissions. Department Manager gets approval only; the repository
matches the revision department against that user's active Employee Master
departments before accepting a decision.

Content access is independent of metadata access. `all-signed-in` releases appear
in public signed-in registers. Restricted content requires an existing per-type
read grant, QA control capability, or approval responsibility for that document's
department. PDF and draft-preview routes perform the same check; UI hiding is not
the security boundary.

## Persistence and audit

`document_control.counters` allocates `MRM-QA-###` only inside final release.
Existing numbers are never rewritten. `workflow_state` gates editing, submission,
approval and release while the original `state` column continues to represent
whether immutable PDF bytes exist. Earlier issued revisions display as
Superseded when a later one is released; bytes remain permanent.

Every mutation appends an `audit.events` row targeting the branding document.
Normal viewing does not write audit data. Monitoring confirmations are retained
in `document_control.monitoring_confirmations`; statuses are calculated on read
from release/completion timestamps and configured review months or interval days.
No background reminders, alerts or escalations are scheduled.
