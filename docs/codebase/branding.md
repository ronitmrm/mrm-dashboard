# Branding implementation

Domain contract: [Document Templates](../glossary/branding.md). The domain model,
permissions and issue lifecycle are shared by generated templates and uploaded
Controlled Documents; PDFKit replaces only generated PDF rendering.

## Generated PDFs

`apps/web/lib/branding/pdf.ts` exports the asynchronous `generateBrandingPdf`
entry point used by draft preview and the repository's injected issue callback.
It returns complete PDF bytes or rejects. PDFKit 0.20.2 draws validated content
without a browser, external asset requests or author-supplied markup execution.
Output is bounded to 5 MB, including PDFKit's internal readable queue; stream and
layout errors propagate to existing error handling. Controlled Documents bypass
this renderer. Pricing, employment-letter generators and the react-pdf viewer
remain independent.

- `pdfkit-fonts.ts`: bundled fonts, real variable weights, cluster-safe script
  fallback, shaping, measurement, wrapping and selectable text.
- `pdfkit-layout.ts`: explicit points, brand roles, rich paragraphs/lists/tables,
  bounded shared fitting, JPEG crop/contain and fixed vector artwork.
- `poster-pdf.ts`: single-page Notice and Work Instruction compositions.
- `book-pdf.ts`: per-language cover, details, index and continuously flowing body.
- `typography.ts`: approved Brand Guide B §15.1 typography roles. One CSS pixel
  equals 0.75 PDF points; A4 geometry and 36-point outer margins are explicit.

Outfit uses real 400/500/600/700/800 variations. Hind and Hind Vadodara use bundled
regular/bold faces; Noto Sans Gujarati supplies Gujarati digits only. Fonts are
embedded and subset. Variable instances receive distinct PostScript names because
PDFKit otherwise merges their resources. See [font compatibility notes](../../apps/web/lib/branding/assets/README.md)
for the pinned Fontkit patch. Unsupported glyphs fail clearly. PDF.js can extract
some shaped Indic marks in visual/decomposed order; selectable embedded text and
visually correct shaping do not imply exact logical-source copy order.

Notices retain the fixed 50 mm banner, 128 px Outfit 800 title, 13 px metadata and
footer wordmark. Nonempty bodies occupy equal-height regions in English, Gujarati,
Hindi order, centered horizontally and aligned at the top. One multiplier fits
all body text and headings; fixed banner and metadata are checked independently.
Plain text folds single line breaks and preserves blank-line paragraphs. Rich
paragraphs, lists, headings and historical saved tables remain supported. The
editor still converts old tables to text and does not offer table authoring.

Work Instructions fit titles, sections, captions and metadata with one multiplier.
Text, count-based picture grids, mixed layouts and equal-height picture-left rows
retain fixed regions before fitting. Ordinary pictures crop proportionally;
Visual Guides contain complete images on landscape A4 with locked Bad/Good pairs,
fixed symbols and colours. Other picture layouts retain language-specific steps.
The bounded fit search keeps the minimum multiplier of 0.001; authors still review
readability. Impossible regions reject instead of clipping or adding pages.

SOP/Policy books retain fixed typography and flow measured lines onto additional
pages. Each selected language receives its own cover, details, index and body;
cover is unnumbered and details starts at printed page 1. Heading destinations
come from actual layout. Bounded index passes account for a multi-page index and
must converge. Nested hanging lists, bold/italic/underlined text, starts/restarts/continuations,
heading numbering, index inclusion and explicit page breaks use the existing
validated model. Details metadata and attribution values use the caption role
with Outfit-first script fallback. Attribution fields remain author-entered text,
not an approval workflow.

New releases record `mrm-notice-v13`, `mrm-wi-v11` or `mrm-book-v9`. Existing drafts
use the new renderer when previewed or issued; previously issued PDFs retain their
stored bytes and template marker. No schema migration or historical regeneration
is needed.

## Editing and private delivery

`book-editor.tsx` shares heading/details editing between SOP and Policy. The
restricted rich-text model accepts paragraphs, formatted text and nested lists.
Normalize Tiptap JSON before crossing React Server Actions: ProseMirror's
null-prototype attributes otherwise become temporary client references.
`branding-rich-text.ts` validates the portable JSON subset; `richBody` is
canonical and the parser derives the legacy `body` summary. `brandingOutline`
supplies the same heading order and numbering to editor, saved view and PDF.

Every authoring boundary checks the appropriate per-type read capability; writes
also require both the type write capability and `iso.documents.manage`.
Standalone SOP, Work Instruction, Policy and Controlled Document registers expose
only documents whose control policy is `all-signed-in`. Restricted content uses
the document dossier and its authorization check. Organization scoping and
private response headers apply throughout.
Download/register modules read stored bytes and do not directly import generation.

`packages/db/src/branding.ts` serializes issue under document/revision row locks.
Optimistic versions reject stale drafts. ISO workflow state is separate from the
stored PDF state: draft, pending approval, approved, then released. Final release
requires `iso.documents.release`, allocates the organization-wide MRM-QA number,
sets the effective/revision date to release day, renders or retains the PDF and
stores the audit event in one transaction. A failure rolls back number allocation
and release. Database triggers protect released revisions. Notice remains
single-issue; SOP, Policy, Work Instruction and uploaded controlled documents use
the revision lifecycle and retain the current released PDF until replacement.

## Controlled PDF uploads

Migration 0155 adds bounded draft `uploaded_pdf` bytes. `saveControlledDocument`
uses pdf-lib to validate an unencrypted, nonempty PDF up to 5 MB. Release retains
those exact bytes in `pdf`, clears the draft upload and never invokes generation.
The marker remains `uploaded-pdf-v1`; new revisions start without an upload.
The uploaded file is reviewed during approval. New permanent document numbers are
system-assigned only during final release; retained legacy numbers are immutable.
