# Document control implementation

Domain contract: [Document Templates](../glossary/branding.md).
`branding.documents` and `branding.revisions` own authoring, control metadata,
department approval, release, revision history and immutable PDF bytes.

- Document Control is a tab on `/branding/[type]/[id]`. It retains the responsible
  role required for submission, classification, content access and record metadata.
- Shared actions live in `app/branding/document-control-actions.ts`; authorization
  and PDF access live in `lib/branding/document-control.ts`.
- `iso.documents.manage`, `.approve` and `.release` remain stable permission keys,
  grouped under Document Templates. Approval remains department scoped.
- Published registers and PDF previews keep their existing content-access checks.
- Numbering uses `document_control.counters` within final release. Existing numbers,
  issued PDF bytes and append-only audit history remain unchanged.

On 2026-10-13, Pending Actions, SIPOC, Customer Satisfaction, Risk-Based Thinking,
Interested Parties, Management Review, PEST, SWOT and Master Document List were
retired. Their routes, forms, actions, exports, repositories, permission definitions
and customer-satisfaction upload intent are removed. Migration 0223 removes their
permission grants; historical migrations and saved business records remain.
The root storage cleanup removes only their browser table settings. These modules
have no persistent server cache or background jobs to flush.
