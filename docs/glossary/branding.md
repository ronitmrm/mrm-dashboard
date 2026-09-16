# Branding

Branding contains SOPs, Notices, Policies, and Work Instructions. Safety signage is outside scope.

## Approved print typography (2026-09-15)

All four types use MRM Brand Guide B §15.1 at 100% print scale, with 0.5-inch
(12.7mm) clear outer margins. Header and footer sit inside those margins; body
content additionally reserves space for them. The guide's CSS pixel baseline is
used directly (1px = 0.75pt). No author-selected fonts or sizes, italic or underline.

| Role | Font | Weight | Size | Line height | Tracking |
| --- | --- | --- | --- | --- | --- |
| Display/title | Outfit | 800 | 40px | 1.10 | -0.01em |
| Section heading | Outfit | 800 | 27px | 1.10 | -0.01em |
| Subsection | Outfit | 600 | 16px | 1.30 | 0 |
| Introduction | Outfit | 400 | 17px | 1.60 | 0 |
| Body | Outfit | 400 | 15px | 1.68 | 0 |
| Caption/metadata | Outfit | 500 | 13px | 1.60 | 0 |
| Eyebrow | Outfit | 600 | 12px | 1.30 | 0.16em |
| Gujarati heading/body | Hind Vadodara | 700/400 | 23/15px | 1.35/1.60 | 0 |
| Hindi heading/body | Hind | 700/400 | 23/15px | 1.35/1.60 | 0 |

SOP/Policy text never shrinks; additional body content flows to further pages.
Notice/WI text uses these sizes as proportional baselines. As approved on
2026-09-16, sparse content enlarges and dense content shrinks to fit one page: one
shared multiplier applies to content across all languages and picture cards.
For Notices, only the language bodies scale: the NOTICE banner title stays128px,
and the number/date stay13px, regardless of body length. For Work Instructions,
titles, headings, bodies, captions and metadata scale together. Choose the largest multiplier that
fits every text region, including the title/banner and document metadata, without
overlap or clipping. No independent card/font fitting. The one-page limit is strict.
Layouts, pictures, margins and page scale stay fixed. The minimum text multiplier
is 0.001; geometrically impossible layouts report an error instead of clipping.
Existing issued PDF bytes remain immutable. Internal logos omit the tagline.

SOP Register, Work Instruction Register, and Policies Register are standalone
main modules outside Branding, available to every signed-in user regardless of
role or Branding permissions. They list one latest published (issued) revision
per document, with its published metadata and PDF. Unissued documents, draft
changes, and history are not shown. A revision draft does not replace the current
published version. Branding remains the authoring and retained-history workspace.

- SOPs and policies share one format: cover, document details, automatic index,
  then continuously flowing numbered headings and nested subheadings. Each language
  has its own book. The cover is unnumbered; details starts at printed page 1.
  Headings may have body text, child headings, or both. Subheading groups support
  hierarchical, local or no numbering; authors choose which subheadings appear in
  the index. Index references use rendered printed page numbers. A heading can
  explicitly start a new page; short sections otherwise share pages.
  Bodies and introductions support paragraphs, bold, bullet and
  numbered lists with independently styled nested lists. List numbering continues
  across page breaks. Details include prepared-by text and optional printed
  issued/reviewed/approved-by names and designations; these are author-entered
  attributions, not an approval workflow. The revision remains the version.
  The Sales & Marketing Procedure reference (2026-09-15) governs the cream cover
  with green frame, green headings, black body and compact header/footer. Existing
  issued PDFs remain frozen. Existing draft plain text remains editable.
- Work Instructions use MRM-WI-0001 numbering and the same single-issue lifecycle
  as notices. They contain multiple ordered heading/body sections, no cover or
  index, and must fit one A4 page including all selected languages. The editor starts
  with one shared title and one heading/body pair per selected language. Add Heading
  appends another pair; the last pair cannot be removed. The text wall-poster style
  follows the Washing & Drying reference: green background, cream rounded panel,
  green heading labels and the document number above the title. Body font size
  automatically fits the available space, with proportional headings. The author
  reviews the generated draft and shortens text if needed; small text does not
  block generation. Never expand to a second page.
  Sections offer four formats: heading/body, text on picture (a green
  caption overlapping its lower edge), picture left/body right, and visual guide. No picture-only
  format exists. Picture sections form a count-based grid on one page (four use
  two columns and two rows). Every picture/caption box is fixed before fitting
  the shared document text scale; text length never increases its box. Mixed formats and
  selected languages share the same page. Pictures stay attached to their section
  when reordered and are retained with saved drafts and immutable issues.
  Picture frames are filled edge-to-edge, preserving proportions and cropping
  excess edges. Picture sections get automatic step numbers in language-appropriate
  digits, following section order within each language. Their heading is optional
  and separate from the step number; their body and picture are required on issue.
  When all sections use picture-left/body-right, follow the Weigh Scale Calibration
  reference: full-width stacked rows, approximately 40% picture and 60% green text
  box. The number of sections fixes equal row heights; all captions share one scale.
  An all-visual-guide document follows visual checking.pdf: one landscape page of
  comparison rows, complete picture on the left, fixed red cross for Bad or green
  tick for Good, and editable text in the matching colour. The author selects
  Good/Bad; symbol artwork and colours cannot be edited. Visual rows replace step
  numbers with symbols. Row count sets dimensions before fonts fit the text boxes.

- Each type has an independent, organization-wide sequence: MRM-SOP-0001,
  MRM-NTC-0001, MRM-POL-0001. Numbers are assigned on first issue, never reused,
  never reset by year. SOP and policy revisions retain the number and use R00,
  R01, etc. Notices are issued once, without revision labels or a revision flow;
  corrections require a new notice with a new number. Existing retained PDFs
  remain available and are never rewritten.
- A document has at most one editable draft. Issuing freezes its original inputs,
  language content, author, issue date, template version, and exact PDF bytes.
  No approval stage exists. For SOPs and policies, creating the next revision copies the previous issue;
  its change reason is required. The latest issued revision remains current until
  its replacement is issued. Issued revisions cannot be updated or deleted.
- Register cards count distinct documents across all pages for the selected type:
  total, issued at least once, and unissued drafts. SOPs/policies additionally
  count issued documents with a revision draft. Issued is not an approval status.
- Every type supports English, Hindi, Gujarati, and combinations. Selected
  languages must have reviewed content before issue. AI may arrange, rewrite,
  and translate supplied facts; it must flag gaps rather than invent facts,
  procedures, dates, consequences, or authorizations. The author reviews output.
  AI integration is deferred by the user on 2026-09-14 pending provider selection;
  the current version supports manual content and copying source text without translation.
- SOP inputs cover purpose, scope, responsibilities, equipment/PPE, procedure,
  precautions and records. Notices cover audience, message, action and dates.
  Policies cover purpose, scope, rules, responsibilities, exceptions and
  consequences. Title, department and effective date accompany each document.
  The effective date may be today; a future date is not required. Issue requires
  a valid, non-empty date, with no comparison against the current day.
- Brand guide v1.0 governs PDFs: Outfit, Hind, Hind Vadodara; MRM Green #006A49,
  cream #F7F7F2, black #050505, restrained Tennis #8BC341; original internal logo
  without tagline on internal pages. The supplied Policy Cover, Machine SOP and
  Notice Options-1 PDF examples guide template v3: green cover with the original
  tagline lockup, green metadata headers and outlined topic panels, and a white
  notice with a large green banner and full footer wordmark. Notice languages
  flow together. The later Notice.pdf reference supersedes the notice design:
  white page and a green Notice banner, a centered footer wordmark and one
  centered free-text body per selected language. The 2026-09-16 notice correction
  restores the reference banner proportions: 50mm tall, with a 128px Outfit 800
  NOTICE title (a notice-specific exception to the general 40px title baseline).
  The title, notice number and date retain their fixed baseline sizes. Selected language
  bodies occupy equal-height regions of the available space between the date
  and footer, centered horizontally and vertically. Notice authors include
  paragraph breaks as blank lines; single line breaks reflow as spaces so every
  language wraps across the same full body width without changing font sizes.
  The saved source text remains unchanged. Notice authors include
  audience, message, actions and dates directly in that body; there are no separate
  source, heading or translated-title fields. Add Body adds another language
  (English, Hindi or Gujarati, once each). Any one language or any combination
  is allowed; neither English nor all three languages are compulsory. Existing
  draft headings and text are
  combined into the body when edited. The notice number prints in the top-right corner above the banner;
  drafts show Number assigned on issue. Titles and author remain in records and
  PDF metadata.
  Gujarati precedes Hindi as in the reference; English comes first when selected.
  No printed page counter. All languages share one page; all language bodies use
  the same enlargement or shrink factor without clipping text. Review the PDF for
  readability before issue. A4 templates retain
  the agreed cover/index/topic structure for SOPs and policies.
- Per-type View and Save/Issue capabilities govern pages, actions and PDFs.
  There is no anonymous PDF delivery or automatic distribution.

- Visual Guide has exactly two fixed entries per selected language: Bad Picture/Bad Text and Good Picture/Good Text. Symbols, order and format are locked; only pictures and captions are editable. It cannot mix with other Work Instruction formats.
