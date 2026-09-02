# Design BOM, Drawing, and ECN

**Product Design Dossier**: The current approved design definition owned by one
controlled Product. It contains classification, material details, applicable
manufacturing processes, canonical BOM, drawings, Design controls, release
status, and revision. It never contains Customer pricing.

**Product Design Revision**: One immutable released Product Design Dossier
version. Initial release is `00`; each approved ECN increments it. Exactly one
revision is Current and every earlier released revision is Superseded.
_Avoid_: Editing released Product/BOM evidence, reusing a revision number.

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

**Drawing Register**: The centralized current-only drawing list with exactly one
row per part. It shows the current released drawing, release/effective date,
current BOM revision, latest ECN, approver, and a read-only view action.

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
shows the released Product Design revision, current drawing, drawing history,
pricing summary, hierarchy, latest ECN, and status. Released values cannot be
edited from Portfolio.
