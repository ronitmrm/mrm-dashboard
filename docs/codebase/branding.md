# Branding implementation

## Shared SOP/Policy book (v8, 2026-09-16)

- `typography.ts` is the shared Brand Guide B §15.1 source for PDF font roles.
  SOP/Policy use fixed CSS pixel baselines. Notice v12 and WI v10 use the same roles
  multiplied by one root `--print-scale`, measured by `fitSinglePageText` against
  every text box. No independent title/card fitting. See glossary for full table.
  Print page scale is 100%; 12.7mm outer margins are separate from internal spacing.
- Gujarati digits use a bundled Noto Sans Gujarati face restricted to U+0AE6–0AEF;
  Hind Vadodara has no numeral glyphs. Embedded fonts keep downloaded PDFs portable.
- Notice v12 adds optional level-2 rich-text headings to the notice toolbar,
  saved content and PDF. Heading and body sizes share the one-page fit multiplier.
  Banner title/number/date remain fixed. Empty/unselected languages are omitted
  and each remaining body region is top-aligned.
  Its Tiptap body supports headings, paragraphs and lists. Table controls and the
  table extension were removed at user request; old table text is retained when
  opening the editor. Saved-content/PDF readers still accept existing table data.
  Fitting measures the entire formatted body.
- Notice/WI fitting now searches above and below the baseline: double the upper
  bound until a text region overflows, then binary-search the largest fitting
  shared multiplier. WI title, body, captions and metadata scale together. Notice
  bodies scale together; banner title, number and date override the multiplier
  to1, keeping128px/13px/13px baselines. Empty notice bodies stay at baseline.
  Headers and metadata are checked for overlap. Generated PDFs must have one page.
- Notice v12 centers each language horizontally in a top-aligned equal-height grid region and centers the
  footer. Its 50mm banner and 128px title restore reference proportions under the
  explicit notice exception in the glossary. Fitting checks each region's text;
  one shared scale still applies. One, two or three selected languages are valid.
  Single pasted line breaks become spaces for full-width wrapping in every
  language; blank lines retain paragraphs. Saved source text is not modified.
- Details metadata and attribution values use the caption role (Outfit 500,
  13px), including metadata labels. Body paragraphs retain their separate 15px
  baseline. New issues use book v8; previously issued PDF bytes remain unchanged.

- `book-editor.tsx` composes the same heading/details editor for both types.
  Tiptap StarterKit is shared with the notice editor; the book schema is restricted
  to paragraphs, text emphasis, and nested bullet/numbered lists. Lists support
  indent/outdent and restart/continue within a sibling group.
  Normalize `editor.getJSON()` through JSON serialization before storing client
  state: ProseMirror's null-prototype attributes otherwise become temporary client
  references across React Server Actions, failing when the parser reads `start`.
- `branding-rich-text.ts` validates the portable JSON subset at the server boundary
  and escapes all text when rendering. `richBody` is authoritative when present;
  the parser derives the legacy `body` summary. Existing plain-text drafts need no
  migration. Heading children are bounded to four levels and 100 total per language.
  Introduction and printed attribution fields live in each translation's details.
- `brandingOutline` supplies identical numbering/order to the editor, saved view
  and PDF. Parent headings can have children without their own body. Notice/WI
  reject book-only fields and keep their existing layout and issue behavior.
- `book-pdf.ts` renders cover/details/index/continuous content. Chromium outlines
  resolve heading locations after actual pagination; the index is rendered again
  using its final page count. Each language starts printed numbering at details=1.
  A separately rendered frame is embedded on every internal page because repeated
  Chromium PDF calls can omit font-based header/footer templates. Content is
  embedded onto fresh output pages to isolate graphics state before frame stamping.
- Reference layout: fixed display-size cover/details title without
  a duplicate running header, centered index title, brand body size, green hierarchy,
  hanging lists, and readable footer metadata. Details retain the footer; index
  and content also receive the running header. Attribution names/designations
  occupy separate rows when supplied; no approval names are invented.
- Newly issued SOP/Policy PDFs record `mrm-book-v6`. Frozen issued PDFs are unchanged.
  No database migration or change to automatic document sequences is required.

The older template descriptions below are historical where superseded by v4.

- Standalone published registers: `/registers/sop`, `/registers/work-instruction`,
  `/registers/policy`. Each has a direct main-sidebar entry outside Branding and
  is available to every authenticated user without a Branding capability grant.
  `withPublishedRegister` enforces sign-in and the three supported types.
  The register PDF endpoint serves only the latest issued revision; historical
  PDFs and authoring still require Branding permissions. `listPublished` selects the latest
  issued revision in SQL before returning metadata; drafts never enter the list.
  All published records load for persistent table filtering. PDF actions open the
  existing authenticated attachment viewer, without linking to document history.

- Routes: `apps/web/app/branding/[type]`, types `sop`, `notice`, `policy`, `work-instruction`.
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
  no JavaScript or network requests. SOP/policy languages each start a new book;
  notice/WI languages flow together. Automatic wrapping, page numbers and references.
- Linux hosting uses `@sparticuz/chromium`; Next file tracing includes its binary
  and font assets. Resolve the binary directory's real path in Next configuration:
  pnpm's app-level symlink path can package binaries separately from the runtime
  package in `.pnpm`, causing preview and issue to fail on Vercel.
  Windows development detects installed Chrome/Edge. An explicit
  `BRANDING_CHROMIUM_PATH` can select another local browser executable.
- AI writing/translation is intentionally deferred pending the user's provider
  decision. No document text is sent to an AI service. Editors accept final text
  in all three languages; adding a language does not translate existing text.
- Migration 0146 adds Work Instruction constraints and permissions. Template v2
  renders SOP/policy covers, indexes and individual topic PDF segments, merges
  with pdf-lib, and stamps global page numbers. Index numbers come from rendered
  segment page counts. Work Instructions reject output over one page. Issued
  historical PDFs remain unchanged. Reordering sections changes the next draft.
- Registers load 100 records per page; column filters apply to that page and
  persist in the browser. Detail history retains every issued revision.
- Summary cards use organization/type-scoped aggregate counts across all pages,
  independently of table filters. Notices have no new revision flow: repository
  writes enforce one issue, while earlier retained PDFs remain accessible.
  Notice PDFs and register rows omit revision labels; SOPs/policies retain them.

Verification: run the four root checks in AGENTS.md. For PDF changes, render and
inspect multilingual samples and long documents. Test migration/lifecycle writes
on an isolated branch; local and production normally share Neon staging.

Template v3 follows the supplied PDF references (2026-09-15). Covers use zero
print margins and a rounded green panel; other pages retain content margins.
Cover pages count toward the index but do not display a page counter. Exact full
wordmark SVGs were extracted from the supplied HTML guide and bundled alongside
the fonts. Newly issued revisions record v3; existing frozen PDFs are unchanged.

Notice template v12 follows the later Notice.pdf layout: a dedicated one-page
renderer with the shared brand fonts and per-region fitting after
fonts load. The number prints at top-right (drafts use an unassigned placeholder);
number/author/title are also stored as PDF metadata. Blank-line paragraphs are
preserved; language bodies enlarge or shrink together to fit their regions while
the notice title, number and date remain fixed.
SOP/policy use the separate book renderer.

Work Instruction template v6 adds private bounded JPEG snapshots to sections;
the browser converts JPG/PNG/WebP uploads to metadata-free JPEGs (long edge at most
1200px, data URL at most 400,000 characters, at most 20 pictures per document).
They are stored in the existing authorized document JSON, with no public URLs or
external PDF fetches. Text retains its separate 180,000-character document limit.
Existing sections without a layout remain text. The three layouts are `text`,
`text-on-picture`, and `picture-left`. Picture-bearing documents use a count-based
grid with fixed cells/caption dimensions; four sections make a 2x2 grid. After
font loading, all captions use the same document scale without changing boxes. Draft
generation does not reject small text; authors review the result themselves.
Pictures fill frames with proportional cropping. Step numbers are derived from
section order per language, separately from optional picture-section headings.
The shared `brandingStepNumber` uses English, Hindi or Gujarati digits in the
editor, saved content and PDF. Text-only sections still require headings on issue.
An all-`picture-left` document uses one column of equal-height rows, matching
MRM-QA-015-093: 40% framed picture, 60% rounded green caption, automatic steps.
Mixed layouts retain the existing count-based grid; captions never expand rows.

WI v7 adds `visual-guide` sections with a validated `assessment` of `good` or `bad`.
An all-visual document renders A4 landscape, full-width equal-height rows and
uncropped comparison pictures. Tick/cross SVG paths and green/red colours are
fixed in the renderer; captions remain editable and share one text scale. Symbols
replace step numbers in this layout and never depend on text or uploaded artwork.

The text layout follows the Washing & Drying text poster. The editor
normalizes each selected language to at least one heading/body pair, with one
shared title synchronized on save. Notices use the dedicated single-body editor.
The renderer fits all text with one binary search after fonts load,
measuring the actual panel space; it emits exactly one A4 page. Keep browser
evaluation callbacks free of named nested functions because tsx inserts helpers
that are unavailable inside Chromium. Frozen PDFs are not regenerated.

Visual Guide editor locks the document to bad/good pairs per language. Only picture uploads and captions remain editable; no headings, format/assessment selectors, ordering or section controls. Domain parsing rejects incomplete pairs or mixed formats. Selecting Visual Guide preserves the first two existing entries (headings join captions); more than two must be reduced explicitly first.

Notice v7 uses notice-editor.tsx: one body per language with Add body and a language selector. Old draft headings/body sections merge into the body through brandingNoticeBody. Notice issue validation permits blank section headings; title remains metadata. PDF font fitting shares one page across all languages and verifies page count. Issued PDFs stay frozen.
