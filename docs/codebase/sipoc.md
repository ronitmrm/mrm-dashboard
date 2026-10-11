# SIPOC process maps

`document_control.sipoc_maps` stores the current working map, revision, version,
latest QA findings and operative approved revision pointer. Structured JSON
contains independent supplier/input/step/output/customer lists plus process
boundaries, ownership, specifications, acceptance, controls and measures.
`sipoc_revisions` retains immutable approved snapshots and the owner name at
approval. The trigger rejects updates/deletes of approved revisions.

`packages/db/src/sipoc.ts` owns organization scoping, permission checks,
active staff selection, validation, locked transitions and before/after audit.
`sipoc-domain.ts` defines input fields and submission readiness. Draft editing
after approval starts a new revision without replacing the approved map;
submitted maps are locked until QA decides. No automated expiry or closure.

`/iso-document/sipoc` is the register, `/new` prepares a draft and `/<id>` shows
working/approved maps, editing, QA decisions, revisions and source/history.
Excel retains current maps, approved snapshots, source and audit.
Read/manage/approve grants are distinct. Department managers prepare;
QA HOD/administrators approve. The server resolves these grants, never client data.
SIPOC is an organization-selected process mapping method, not an ISO mandate.

Migration 0216 seeds ten workbook rows as incomplete Drafts. It preserves exact
source cells and chooses descriptive process names/ordered steps for assessment.
No supplier/customer-to-owner assumption or inferred approval/criteria/target.
