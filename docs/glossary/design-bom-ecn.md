# Design BOM, Drawing, and ECN

**Product Design Dossier**: The current approved design definition owned by one
controlled Product. It contains classification, material details, applicable
manufacturing processes, canonical BOM, drawings, Design controls, release
status, and revision. It never contains Customer pricing.

**Product Design Revision**: One immutable released Product Design Dossier
version. Initial release is `00`; each approved ECN increments it. Exactly one
revision is Current and every earlier released revision is Superseded.
_Avoid_: Editing released Product/BOM evidence, reusing a revision number.

**Component Design Revision**: The released Product Design Revision used by one
BOM component. Current BOM summaries show it beside a component link to that
Product's Design Dossier. Every new parent revision snapshot pins the component
revision used at release; an older snapshot never resolves this value from the
component's current revision.

**Package / Assembly Design Weight**: The bottom-up sum of each current direct
component's Product Weight multiplied by its BOM quantity. It never starts from
the parent's previously stored weight. When a component Design Revision is
released, every direct and indirect Package / Assembly parent is recalculated
in dependency order and receives its own next immutable Product Design Revision.

**Initial Design Release**: A two-step Design workflow. Design first completes
all structured Product/BOM data bottom-up, then resolves every required part's
drawing as Uploaded or Not Required. Missing drawings keep the Design In
Progress. Release creates Product Design and Drawing revision `00`.

**BOM Process Applicability**: The current released Product Design Dossier's
selected manufacturing processes. Initial Design may seed the selection from
positive process prices, but after initial creation only the BOM selection is
authoritative. Pricing cannot add or select a process.

**ECN Design Revision**: The editable Design-stage draft for one Engineering
Change Note. Submission locks before/after evidence for Design HOD review; it
does not publish. Design HOD approval publishes the next Product Design and
Drawing revisions. Rejection requires remarks, retains rejected evidence, and
returns the ECN to Design.

**Drawing Revision**: One immutable drawing version for one controlled Product
or part. Initial release is `00`; later releases are `01`, `02`, and so on.
Draft and rejected files stay in the ECN audit trail. Exactly one released
revision is Current; superseded originals remain viewable and downloadable.

**Legacy Drawing Baseline**: The one-time, idempotent migration from the
approved legacy drawing register. Its metadata first appears in Drawing History
as `Pending Drawing Upload`; this provisional row is not a current released
drawing and may have no file. Valid register revisions and dates are retained.
Released Products absent from the register start at revision `00` dated
`2026-09-02`; `M986` starts at `00` dated `2026-06-07`. Register rows without a
released Product are ignored. When its UID-matched file is later attached, the
same provisional row is released without changing its revision or date, and
that revision becomes both the current Drawing Revision and the current Product
Design/BOM Revision. Missing intermediate revisions are not invented.

**Aligned Drawing Release Revision**: An approved ECN always creates the next
Product Design/BOM Revision. When that ECN includes a drawing change, the new
Drawing Revision uses the same revision number and label as that released
Product Design/BOM Revision. A BOM-only ECN leaves the current Drawing Revision
unchanged, so the drawing may legitimately trail the Product Design revision.

**Drawing Register**: The centralized one-row-per-part list of current released
drawings plus provisional Legacy Drawing Baselines awaiting their files. It
shows drawing status, release/effective date, current BOM revision, latest ECN,
approver, and a read-only view action when a file exists.

**Drawing Revision History**: The immutable per-part sequence of all released
Drawing Revisions, including release/effective date, ECN or Initial Release,
reason, raiser, uploader, Design HOD approval, linked BOM revision, and separate
view/download actions.

**Authenticated Attachment Viewer**: The shared signed-in file surface opened
when an upload is clicked. PDFs and images render inline; incompatible formats
show metadata and a compatible preview when available. Original download is a
separate action. Full-screen and close/back never mutate the Artifact.

**Cost-Impacting ECN**: An ECN whose approved Design change alters a Product
cost driver, including weights, material/category inputs, Production Type,
applicable processes, or another canonical pricing input. It closes only after
Product Parameter Costing and every affected Customer Product Parameter Costing
decision finish. A non-cost classification is recorded explicitly.

**Product Portfolio Dossier View**: The canonical read-only Product view. It
is a design-only summary showing Product classification, sizes, weights, die,
material/rod details, process applicability, current drawing, the complete
recursive BOM, and Product Design Revision history. It never shows pricing or
costing. The Current revision opens the complete tabbed Design Task read-only;
an earlier revision opens only the immutable Product/BOM summary captured at
that release. Historical fields that were not captured are shown as unavailable
and are never filled from the current Product.
