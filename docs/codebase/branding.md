# Branding implementation

- Routes: `apps/web/app/branding/[type]`, types `sop`, `notice`, `policy`.
  Shared `OperationalTable`, `PageHeader`, `ActionToolbar`, forms, tabs and
  `AttachmentViewerLink` preserve the dashboard conventions.
- Domain contract: [Branding](../glossary/branding.md). Repository:
  `packages/db/src/branding.ts`; input validation: `branding-domain.ts`.
- Apply migration `0144_branding_documents.sql` with the existing migration runner.
  Only administrators receive initial access. Other users get per-type View and
  Save/Issue permissions through Access Administration. Every server boundary
  checks View, and every write also checks Save/Issue.
- PostgreSQL document locking serializes saves, revisions and issue. Draft
  versions reject stale edits. Per-type counters allocate numbers transactionally
  on first issue. A failed PDF render rolls back both number allocation and issue.
  Repeated issue requests return the same issued revision. Database triggers
  reject modification/deletion of issued revisions.
- Frozen PDFs are retained in the revision row as bounded bytea (5 MB maximum),
  like employment letters. They are not re-rendered on download. This keeps
  document text, numbering and PDF issuance atomic. These PDFs are not in the
  general attachment ledger; they are retained with their document history.
- PDF renderer: Chromium/Puppeteer, A4, bundled OFL fonts, escaped plain text,
  no JavaScript or network requests. English/Hindi/Gujarati each start on a new
  page. Automatic wrapping, page numbers, references and internal logo.
- Linux hosting uses `@sparticuz/chromium`; Next file tracing includes its binary
  and font assets. Windows development detects installed Chrome/Edge. An explicit
  `BRANDING_CHROMIUM_PATH` can select another local browser executable.
- AI writing/translation is intentionally deferred pending the user's provider
  decision. No document text is sent to an AI service. Editors accept final text
  in all three languages; Copy Source does not claim to translate it.
- Registers load 100 records per page; column filters apply to that page and
  persist in the browser. Detail history retains every issued revision.

Verification: run the four root checks in AGENTS.md. For PDF changes, render and
inspect multilingual samples and long documents. Test migration/lifecycle writes
on an isolated branch; local and production normally share Neon staging.
