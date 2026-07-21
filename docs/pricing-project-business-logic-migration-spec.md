# Pricing Project Business-Logic Migration Specification

Status: implementation-ready audit specification
Date: 2026-07-21
Source repository: `../pricing`
Target repository: `mrm-dashboard`
Target branch: `feat/logic-migration`

## 1. Objective

Migrate the complete Pricing application's business behavior into the MRM Dashboard without changing what the Pricing application does. The target must use the completed PostgreSQL, Redis, and Better Auth foundation, the MRM Dashboard shadcn design system, and the existing `apps/web` / `packages/db` package boundaries.

This specification covers behavior, not merely migrated rows or similarly named screens. Completion requires parity for every workflow transition, formula, validation, side effect, historical-selection rule, import decision, attachment, report, export, correction, and authorization boundary documented below.

The Pricing SQLite database and the 2026-07-18 archive remain immutable migration evidence. Runtime code must not read SQLite.

## 2. Sources and precedence

The audit used the Pricing and MRM Dashboard code graphs, every Pricing route and write entry point, the current PostgreSQL commercial repositories and integration tests, both repositories' documentation, the Pricing schema and repair/audit scripts, and the completed PostgreSQL migration baseline.

When sources disagree, implementation must apply this precedence:

1. Current executable Pricing behavior in `pricing/src`.
2. Current Pricing regression tests in `pricing/tests`.
3. Repeatable workflow checks in `pricing/scripts/audit-workflow-rules.py` and `.mjs`.
4. Pricing workflow and formula documentation.
5. Existing MRM Dashboard behavior.

An inconsistency is not permission to choose the target's current behavior. It is a blocking reconciliation item that must be characterized against a copy of the archived SQLite data and resolved explicitly.

## 3. Non-negotiable no-functional-change rules

1. Preserve source states, labels, transition preconditions, ordering, default values, error conditions, and visible outputs.
2. Do not combine or skip source stages. In particular, Technical Review, Sales clarification, Design, Product Parameter Costing, Customer Parameter Costing, quote send, PO review, and PI approval remain separate decisions.
3. Preserve the source's historical-row selection behavior even where PostgreSQL offers a cleaner model. Sent quote PDFs, active prices, PO matching, package snapshots, and revisions have different selection rules.
4. Preserve source arithmetic and percentage conventions exactly. Whole percentages entered by users are divided by 100 at the action boundary; stored calculations use decimal fractions.
5. Do not silently strengthen, weaken, or reinterpret source validation. A desired policy improvement becomes a separately approved follow-up after parity.
6. Do not collapse List, Package, and Assembly behavior. Assembly is a BOM parent and participates in recursive quote snapshots and revision propagation.
7. Do not recalculate historical quote, package-component, PI, drawing, or website-product evidence from current masters.
8. Preserve source side effects such as follow-up creation, Q-to-M/P conversion, drawing-history creation, website-product creation, correction logging, file persistence, and all affected register updates.
9. Better Auth may replace the source authentication mechanism, but each source page's read/write distinction must map to an explicit target capability. A broad layout capability is not sufficient authorization for a narrower action.
10. UI composition may change to the MRM Dashboard design system; business fields, actions, workflow visibility, import decisions, and exported content may not.
11. Use the configured shadcn `radix-luma` primitives from `@workspace/ui`; keep all commercial screens responsive, dark-mode compatible, keyboard accessible, and data-dense. Do not reproduce the Pricing repository's bespoke CSS as a second design system.
12. Redis remains disposable acceleration. No Pricing command, report, session, or canonical read may depend on Redis availability.

## 4. Ubiquitous language

| Term                       | Canonical meaning                                                                                                                            | Do not confuse with                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Enquiry / ENQ              | A customer request containing one or more independently progressing line items.                                                              | A quote or customer price.                                                                                |
| Enquiry line               | One customer part/description within an enquiry. It owns technical, clarification, design, costing, and matching state.                      | An entire enquiry status.                                                                                 |
| Technical handover         | Enquiry-level Sales decision that releases all lines to Technical Review after commercial terms are complete.                                | An individual line becoming feasible.                                                                     |
| Clarification task         | An open request from one workflow stage to another, most commonly Technical/Design to Sales.                                                 | A free-form note.                                                                                         |
| Portfolio match            | A Design decision that links a line to an ordered internal product and skips new-product Design/Product Costing.                             | A similar customer code.                                                                                  |
| Q product                  | A quote-only product identity created from Design and not yet ordered.                                                                       | A sent quote row.                                                                                         |
| Internal product           | An ordered `M...` or `P...` identity. The previous Q identity remains its lineage via `converted_from_quote_uid`.                            | A customer part code.                                                                                     |
| List product               | A non-BOM-parent product costed from material and process inputs.                                                                            | A Package or Assembly.                                                                                    |
| Package                    | A BOM parent whose quote contains immediate component snapshots and recursively quoted BOM-parent children.                                  | A flat sum of every descendant.                                                                           |
| Assembly                   | A BOM parent nested inside or sold like a package. It has its own child quote and process/profit/rejection calculation.                      | A List component.                                                                                         |
| Product Parameter Costing  | Product-level material/process calculation and completion gate.                                                                              | Customer-specific profit and commercial terms.                                                            |
| Customer Parameter Costing | Customer/enquiry quote calculation, including profit, packaging, shipping, FX, and approved price.                                           | Product master cost.                                                                                      |
| Quote item                 | One immutable commercial-price revision for one customer/enquiry/product context.                                                            | The mutable active price pointer.                                                                         |
| Active customer price      | The source-selected quote row used for future pricing and PO matching.                                                                       | The historical quote used by an already-sent PDF.                                                         |
| Price revision             | A replacement quote row that supersedes an earlier active row while retaining earlier evidence.                                              | Editing the old row.                                                                                      |
| Product lineage            | The identity relationship between a Q product and its converted internal product.                                                            | Customer-part-code price scope; current source code sometimes intentionally scopes only by customer code. |
| Package snapshot           | Immediate child quote/product evidence stored under a parent quote at quote time.                                                            | Current BOM contents.                                                                                     |
| PO price decision          | `Keep Our Price` or `Accept PO Price` for a matched PO line.                                                                                 | PI approval.                                                                                              |
| PI                         | Proforma Invoice generated only after every PO line is matched and decided.                                                                  | The source PO.                                                                                            |
| Bulk price revision        | A staged set of customer- or product-parameter changes completed once and propagated through affected quote trees.                           | A direct mass update.                                                                                     |
| ECN                        | A two-stage Engineering Change Note: Design changes the product, then Costing records one price decision per affected active customer price. | A bulk commercial revision.                                                                               |
| Correction                 | A controlled reversal or correction action plus register evidence. Some source corrections are destructive only for unused Q products.       | Rewriting sent commercial history.                                                                        |
| Website product entry      | Product catalog data created for an ordered product and completed independently for website use.                                             | The core product master.                                                                                  |

## 5. Source-to-target capability inventory

Statuses: **Covered** means the target has an evidenced end-to-end implementation; **Partial** means some repository/schema behavior exists but source parity is missing; **Missing** means no target capability; **Divergent** means target behavior conflicts with current source behavior.

| Capability                                 | Source behavior and references                                                                                                                                                                                                                                                                                  | Current target                                                                                                                                                                                                                                                                                                                                              | Required target outcome                                                                                                                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and page access             | Page-level read/write matrix for Pricing and adjacent HR panels in `pricing/src/lib/access-control.ts:40-67`, enforced by `canAccessPath` / `canWritePath` at `:161-184`.                                                                                                                                       | **Partial.** Better Auth capabilities exist in `packages/db/migrations/0003_capability_seed.sql:1-24`, but several commercial pages use `pricing.costing.read` instead of their seeded narrower capability, and the commercial layout only checks `pricing.dashboard.read` (`apps/web/app/commercial/layout.tsx:8-25`).                                     | Map every source Pricing page to the seeded read/write capability; actions check write capability server-side; navigation hides inaccessible destinations without becoming the security boundary. HR remains an explicit scope decision. |
| Pricing dashboard and analytics            | Counts, aging, pie and six-month analytics from `getDashboardStats` / `getDashboardAnalytics` (`pricing/src/lib/queries.ts:4478-4615`) rendered by `pricing/src/app/page.tsx`.                                                                                                                                  | **Partial.** `/commercial` is a small PostgreSQL overview (`apps/web/app/commercial/page.tsx:57-99`).                                                                                                                                                                                                                                                       | Preserve every source metric, time bucket, definition, filter, and empty state using bounded PostgreSQL queries.                                                                                                                         |
| Customer master CRUD                       | Create/update validation and audit-visible fields in `pricing/src/app/actions.ts:724-797`; full customer screen at `pricing/src/app/customers/page.tsx`.                                                                                                                                                        | **Covered.** Authorized create/update actions and shared-shadcn forms use the organization-scoped repository in `packages/db/src/customers.ts`; real-PostgreSQL and browser acceptance cover managed UID, source defaults, status, and actor audit.                                                                                                         | Add create/update forms and repository methods with source defaults, uniqueness, fields, statuses, and permission checks.                                                                                                                |
| Pricing masters CRUD                       | Design categories/subcategories/processes, machine types, grades, rod types, material rates, shipping terms, packaging options, quote terms, commercial terms, website applications/certifications/field options (`pricing/src/app/actions.ts:2706-3072`).                                                      | **Covered.** `packages/db/src/commercial-masters.ts`, migration `0025`, and `/commercial/masters` provide every source master family, organization-scoped natural keys, grade-plus-rod lookup, ordering, activation, and actor audit.                                                                                                                       | Port every master create/update operation and uniqueness/default rule. Preserve grade+rod-type material lookup and term ordering.                                                                                                        |
| Master workbook import/template            | Multi-sheet XLSX import with header aliases and upsert/ignore semantics (`pricing/src/app/actions.ts:3074-3356`); template at `pricing/src/app/masters/template.xlsx/route.ts:1-158`.                                                                                                                           | **Covered.** `apps/web/app/commercial/masters/workbook.ts` and the template/export routes preserve the source sheets, aliases, defaults, exact filename, XLS/XLSX parsing, row errors, canonical export, and a one-transaction import; integration and browser export/import round-trips pass.                                                              | Implement the same sheets, headers, transformations, sort-order defaults, duplicate behavior, download filename, and atomicity.                                                                                                          |
| Enquiry register CRUD                      | Create, update, conditional delete, commercial-term updates, line summaries, filtering and register views (`pricing/src/app/actions.ts:808-1137`; `pricing/src/lib/queries.ts:1465-1920`).                                                                                                                      | **Partial.** Create/list/detail/add-line exist (`packages/db/src/commercial-workflow.ts:369-459`, `:1560-1695`); update/delete/register spreadsheet behavior is absent.                                                                                                                                                                                     | Add update/delete using the source edit/delete gates, line summary semantics, customer/buyer/source/priority fields, and register filters.                                                                                               |
| Enquiry line CRUD and drawing              | Add/update line, preserve/replace drawing metadata and workflow reset rules (`pricing/src/app/actions.ts:1139-1622`); inline drawing route `pricing/src/app/enquiry-items/[id]/drawing/route.ts:16-57`.                                                                                                         | **Partial.** Add-line and immutable file record exist; no update-line, download route, replacement behavior, or post-handover reset parity.                                                                                                                                                                                                                 | Implement update and inline download with organization/capability checks, safe paths, source metadata, and the exact source workflow consequences.                                                                                       |
| Enquiry CSV/XLS/XLSX import classification | Parser accepts CSV/XLS/XLSX (`pricing/src/app/actions.ts:1624-1767`). Classifier returns Missing Information, Existing Quoted Match, In Progress Match, Possible Match, Description Match, or New Line with corresponding suggested action (`:1849-2034`). Review and apply are separate (`:2095-2378`).        | **Divergent.** Repository can store/apply reviews, but the web action labels every row `Ready` then automatically applies `Create new line` (`apps/web/app/commercial/enquiries/actions.ts:291-328`).                                                                                                                                                       | Port parsing, all classification queries and precedence, a review UI, explicit per-row decisions, idempotent apply, linkage, clarification creation, and commercial-requote shortcut. Never auto-create every imported row.              |
| Enquiry register and line exports          | CSV template, register XLSX/template, logged-line XLSX and the editable spreadsheet screen (`pricing/src/app/enquiries/**`, especially `register/export.xlsx/route.ts:1-103`, `register/template.xlsx/route.ts:1-58`, `[id]/lines/export.xlsx/route.ts:1-74`).                                                  | **Missing.**                                                                                                                                                                                                                                                                                                                                                | Preserve sheets, column names/order, calculated-column omission rules, filenames, filtering, and capability checks.                                                                                                                      |
| Technical Review                           | Six fixed checklist keys (`pricing/src/app/actions.ts:2380-2387`), statuses and clarification side effects (`:2460-2538`), queue at `pricing/src/app/technical-review/page.tsx`.                                                                                                                                | **Partial.** Repository and embedded enquiry UI cover checklist/status/clarification (`packages/db/src/commercial-workflow.ts:558-666`); no dedicated queue and not all source status/redirect behavior is characterized.                                                                                                                                   | Preserve fixed checklist order, queue selection, all status choices, reviewed timestamp, clarification open/close semantics, grade and feasibility fields, and a dedicated workflow view.                                                |
| Sales clarification and matching           | Sales may update the line/drawing, choose new, commercial quote match, or technical-revision match; commercial match skips Design/Product Costing, technical match returns to Technical Review and logs correction (`pricing/src/app/actions.ts:2540-2704`).                                                    | **Partial/Divergent.** Target only stores response and returns technical state to Pending Review (`packages/db/src/commercial-workflow.ts:668-722`); UI exposes no quote/technical match choices or drawing update.                                                                                                                                         | Port both match modes, customer-scoped quote validation, line changes, attachment replacement, linked fields, shortcut design task, technical-revision log, and redirect/queue outcomes.                                                 |
| Design masters and task queue              | Dedicated Design queue; ordered internal portfolio selector; Q/C number allocation; complete field set, requirements/costs, approval, nested BOM editor, internal/customer-marked/CAD files (`pricing/src/app/design-tasks/page.tsx:35-465`; `pricing/src/app/actions.ts:3368-4115`).                           | **Partial.** Repository accepts a useful BOM model (`packages/db/src/commercial-workflow.ts:724-920`), but UI sends only one synthetic List BOM line and omits most design fields/files (`apps/web/app/commercial/enquiries/actions.ts:236-274`).                                                                                                           | Preserve queue, edit lock, portfolio/package selection, automatic Q/C allocation, all task fields, requirement costs, nested Assembly validation, all three file kinds, and multi-row BOM UI.                                            |
| Design-to-costing handoff                  | Design Complete/Not Required plus Not Started/Changes Required are mandatory; creates/updates List, Package, Assembly products and nested BOM, then sets Product Costing or Product Costing Complete (`pricing/src/app/actions.ts:4117-4279`).                                                                  | **Partial.** Target implements main gate/product/BOM creation (`packages/db/src/commercial-workflow.ts:922-1198`).                                                                                                                                                                                                                                          | Add characterization for every Q/C allocation, nested Assembly, existing component, process/remark, material fallback, and redirect result. No handoff may use the target's one-line UI shortcut as its data source.                     |
| Design clarification from Costing          | Costing can request Design changes unless Started/Quoted; sets Design and next-stage to Changes Required and creates a clarification (`pricing/src/app/actions.ts:3908-4015`). Design can request Technical clarification (`:3851-3906`).                                                                       | **Missing.**                                                                                                                                                                                                                                                                                                                                                | Port both clarification directions, locks, state changes, queue placement, and resolution behavior.                                                                                                                                      |
| Design/costing reversals                   | Started handoff can be reversed to Not Started with correction evidence (`pricing/src/app/actions.ts:4281-4357`). Unused Q product can be deleted only if no quote, component-BOM, or matched-design blocker exists (`:4359-4438`).                                                                             | **Divergent.** Target only quarantines requests to rewrite/delete historical prices (`packages/db/src/commercial-revisions.ts`, `recordPricingCorrection`); it has neither source reversal.                                                                                                                                                                 | Implement the source-safe reversal actions exactly. Keep sent/history quarantine separately. Do not prohibit deletion of an unused Q product if all source blockers are absent.                                                          |
| Product Parameter Costing                  | Derived/direct-purchase and Package/Assembly behavior; source fields and completion/backflow at `pricing/src/app/actions.ts:4440-4780`. The persisted `weight_100_pcs` value is treated and displayed as one-piece grams despite its legacy column name.                                                        | **Partial/Divergent.** Core calculation and completion are covered by `packages/db/src/commercial-costing.ts:671-872` and integration tests, but the target form labels the value `Weight / 100 pcs (g)` (`apps/web/app/commercial/costing/page.tsx:140-141`), which changes operator input by 100x. No full source queue/forms or send-back action exists. | Preserve every input/default/lock, direct-purchase suppression, Barstock forcing, master fallback, package behavior, the one-piece-grams UI meaning, and the `sendQuoteBackToProductCosting` gate.                                       |
| Customer Parameter Costing                 | Draft/in-progress quote creation, package/assembly recursive quoting, child inputs, terms, locked sent rows (`pricing/src/app/actions.ts:4782-5352`).                                                                                                                                                           | **Partial.** Core repository, calculation and snapshot behavior covered (`packages/db/src/commercial-costing.ts:874-1253`). UI supports a narrower field set.                                                                                                                                                                                               | Port every source input, defaults, package child/assembly profit editors, process restrictions, draft update behavior, and Costing queue.                                                                                                |
| Quote send and active-price activation     | Quote send stamps the enquiry's quoted rows, activates nonblank customer-code prices, supersedes prior prices, and creates one 15-day Email follow-up (`pricing/src/app/actions.ts:5901-6029`, `:6958-7036`).                                                                                                   | **Divergent/Partial.** Target sends and activates a lineage, but does not create the source follow-up. Target uniqueness is customer+code+lineage while current source activation supersedes by customer+code only.                                                                                                                                         | Characterize the archived collision rows, then reproduce current source scope unless explicitly approved otherwise. Create the idempotent 15-day follow-up in the send transaction.                                                      |
| Quote PDF                                  | Historical quote-row selection favors rows that existed when sent; PDF includes ordered lines, quote terms, current Westmetall Copper/Zinc and live currency/INR rate with fallbacks (`pricing/src/app/quotes/enquiry/[id]/pdf/route.ts:93-176`, `:414-560`).                                                   | **Missing.**                                                                                                                                                                                                                                                                                                                                                | Port PDF layout/content, historical selection ordering, inline filename, quote revision, live-rate failure behavior, and route capability. Add deterministic fixtures for the external-rate branches.                                    |
| Pricing and revision spreadsheets          | Current active pricing, revisions, packages/assemblies, formula columns, currency placement, date selection and client XLSX export (`pricing/src/lib/queries.ts:2859-3456`; `pricing/src/components/PricingSpreadsheetTable.tsx:1-716`).                                                                        | **Missing.**                                                                                                                                                                                                                                                                                                                                                | Port complete datasets, column order/labels, filters, client/server exports, calculated status omission, internal UID display, and historical revision view. Do not revive `price_master`.                                               |
| Product/Assembly registers                 | Product and assembly screens expose parameter state, task actions, BOM relationships and costing links (`pricing/src/app/products/page.tsx`, `pricing/src/app/assemblies/page.tsx`).                                                                                                                            | **Partial.** Read-only products list exists; no Assembly register or equivalent actions.                                                                                                                                                                                                                                                                    | Deliver source-equivalent product and Assembly registers backed by normalized tables.                                                                                                                                                    |
| Follow-ups and Sales queues                | Manual create/complete; completion can schedule the next follow-up; quote send creates a 15-day follow-up; Sales screen contains clarification, quote-ready/sent, follow-up and handover queues (`pricing/src/app/actions.ts:6896-7145`; `pricing/src/app/sales/page.tsx`).                                     | **Missing.**                                                                                                                                                                                                                                                                                                                                                | Port all queues, due logic, manual and chained follow-ups, channel/status defaults, quote-send side effect, histories and exports.                                                                                                       |
| PO import and price review                 | Create PO with optional file, manual/import lines, match active sent/ordered prices, preserve system-price snapshot, choose Keep/Accept, create quote request for unmatched lines (`pricing/src/app/actions.ts:6031-6705`).                                                                                     | **Covered backend / Partial product.** Repository and UI cover core path (`packages/db/src/commercial-orders.ts:432-1196`), but source file persistence/download and output routes are absent. Target ambiguous-match rejection may conflict with current source's ordered `LIMIT 1` selection.                                                             | Preserve source matching precedence and evidence after resolving the documented/code contradiction; add PO file and every source export.                                                                                                 |
| PI lifecycle                               | Generate only after nonempty, matched, decided lines; Draft -> Sent -> Approved; approval activates historical quote and converts Q products/children, then creates drawing/website records; approved PI cannot cancel (`pricing/src/app/actions.ts:6707-6894`).                                                | **Partial/Divergent side effects.** Core PI and Q conversion are covered (`packages/db/src/commercial-orders.ts:1198-1556`), but drawing/website side effects and output documents are incomplete.                                                                                                                                                          | Port exact side effects, gating and status labels; retain exact quote IDs/prices on PI lines; add PDF/XLSX and master exports.                                                                                                           |
| PO/PI reports                              | PO detail XLSX, PO template, PI PDF/XLSX, PO master and Approved PI master with exports (`pricing/src/app/po-pi/**`).                                                                                                                                                                                           | **Missing.**                                                                                                                                                                                                                                                                                                                                                | Preserve columns, percent formatting, sheets, document fields, filenames, inline/attachment disposition, filters and permissions.                                                                                                        |
| Bulk revisions                             | Customer and product routes, field allowlists, staged selection, previews, process guards, recursive direct/nested propagation, completion-once (`pricing/src/app/actions.ts:7147-8787`, `:8789-8831`, `:9234-9687`).                                                                                           | **Partial/Divergent.** Recursive replacement exists, but target exposes only 9 fields (`packages/db/src/commercial-revisions.ts:53-71`) versus 21 source fields and lacks source process aliases/guards, rich preview, change deletion and multi-select UX.                                                                                                 | Port both exact allowlists, value conventions, locked process aliases, previews, multi-row selection, delete-stage action, recursive recalculation order and final IDs.                                                                  |
| ECN                                        | Register -> Pending Design -> Pending Product Costing -> Pending Costing -> Completed; Design edits product/BOM while locked after handoff; Costing decides Keep/Revise per recursively affected price (`pricing/src/app/actions.ts:8833-9232`; ECN previews in `pricing/src/lib/ecn-price-preview.ts:45-663`). | **Partial/Divergent.** Target has only Pending Design -> Pending Costing -> Completed and a description-only UI patch (`apps/web/app/commercial/revisions/page.tsx`; `packages/db/src/commercial-revisions.ts`).                                                                                                                                            | Restore Product Costing stage, full product/BOM design changes, affected-price preview math, exact decision semantics, field labels, locks and completion counting.                                                                      |
| Corrections register                       | Source supports Design handoff reversal, unused Q product reversal, technical-revision match logs and a unified log (`pricing/src/app/corrections/page.tsx`; actions above).                                                                                                                                    | **Divergent.** Target correction UX only quarantines historical quote rewrite/delete requests.                                                                                                                                                                                                                                                              | Keep target quarantine for forbidden history changes, and add all source correction types, candidate lists, blockers, transitions and register columns.                                                                                  |
| Drawing history                            | PI approval creates revision 0 drawing history; users update drawing number/revision/date and laminated quantities; register and XLSX export (`pricing/src/app/actions.ts:5389-5723`; `pricing/src/app/drawing-history/**`).                                                                                    | **Missing.** Migrated data/schema exist.                                                                                                                                                                                                                                                                                                                    | Port creation side effect, unique product+revision behavior, CRUD rules, display date and export.                                                                                                                                        |
| Website product data                       | Ordered products and BOM children create entries; part code derives from category/subcategory codes; status depends on required values; thread standard and assembly slots sync (`pricing/src/app/actions.ts:29-147`, `:5628-5887`; `pricing/src/lib/thread-standards.ts:11-35`).                               | **Missing.** Migrated data/schema exist.                                                                                                                                                                                                                                                                                                                    | Port auto-creation, derived part code, six related assembly slots, material/thread/status sync, edit form/register, and XLSX export.                                                                                                     |
| Adjacent HR proxy                          | `/hr` proxies a separate recruitment service and has panel-specific permissions (`pricing/src/app/hr/page.tsx`; `pricing/src/lib/access-control.ts:22-38`).                                                                                                                                                     | **Not part of current commercial target.** HR capabilities are seeded, but no recruitment system was supplied in this audit.                                                                                                                                                                                                                                | Blocking scope decision: either explicitly exclude as a separate project or provide the HR repository/API and add its own migration spec. Do not claim complete Pricing-repository parity while silently omitting it.                    |
| Legacy price master                        | Source regression explicitly forbids writes to `price_master` (`pricing/tests/audit-regression.test.mjs:76-80`). Active prices are quote items.                                                                                                                                                                 | **Correctly absent from runtime.**                                                                                                                                                                                                                                                                                                                          | Keep absent. Do not create a new mutable price-master source of truth.                                                                                                                                                                   |

## 6. State machines and transition contracts

### 6.1 Enquiry and line workflow

Enquiry technical handover starts `Draft` and becomes `Handed Over`. Handover requires an existing enquiry, at least one line, zero lines in `Need Sales Confirmation`, nonblank Incoterms, Payment Terms, Shipment Mode, Packaging and Currency, and a conversion rate greater than zero (`pricing/src/app/actions.ts:847-928`).

Line Technical Review begins `Pending Review`. The operative source statuses are `Pending Review`, `Need Clarification`, `Need Sales Confirmation`, `Feasible`, `Not Feasible`, `Duplicate / Existing Product`, and `Linked to Existing Work`. `Need Clarification` opens/reuses a Technical Review -> Sales clarification. `Feasible` or `Duplicate / Existing Product` resolves Technical clarifications and returns a Design task from `Need Clarification` to `Pending Design` (`pricing/src/app/actions.ts:2460-2538`).

Sales clarification has three distinct outcomes:

- New/unmatched: line returns to `Pending Review`.
- Commercial quote match: line becomes `Duplicate / Existing Product`; Design becomes `Not Required`; portfolio product is linked; `next_stage_status = Product Costing Complete`.
- Technical-revision match: line remains `Pending Review`, records revision/link fields and a `Technical Revision Match` correction (`pricing/src/app/actions.ts:2540-2704`).

### 6.2 Design and costing workflow

Design status begins `Pending Design`, may become `In Progress`, `Need Clarification`, `Changes Required`, `Design Complete`, or `Not Required`. Next-stage status begins `Not Started`, may become `Changes Required`, `Product Costing`, `Product Costing Complete`, `Started`, or `Quoted`.

A Design task is editable while Design is incomplete. After `Design Complete`/`Not Required`, it is editable only when next-stage is `Not Started` or `Changes Required` (`pricing/src/app/actions.ts:3368-3381`). A new quoted List receives/reuses Q identity; a Package receives/reuses C identity. Portfolio matches must be ordered internal products. Nested child rows are allowed only below an Assembly row (`pricing/src/app/actions.ts:3501-3849`).

Costing handoff requires Design Complete/Not Required and Not Started/Changes Required. A portfolio match moves directly to Product Costing Complete. A new design creates or updates product/BOM state and moves to Product Costing (`pricing/src/app/actions.ts:4117-4279`). Costing may return unsent work to Design; sent/quoted prices are locked and require a revision workflow (`pricing/src/app/actions.ts:3908-4015`, `:4708-4780`).

### 6.3 Quote and active-price workflow

Customer costing saves an unsent row as `In Progress`/Draft-equivalent or `Quoted` depending on the explicit action. Sent/quoted rows cannot be edited in place. Quote send stamps `sent_at`, activates eligible rows and creates the follow-up. Ordering sets `item_status = P`, `workflow_status = Ordered`, preserves any previous `sent_at`, and stamps `ordered_at` (`pricing/src/app/actions.ts:5628-5671`).

For a nonblank customer part code, current source activation supersedes every other quote for the same customer+normalized code. For blank package-child codes, it supersedes by customer+enquiry+product. It increments `price_revision_no`, preserves inherited sent time, and propagates P status when an ordered row already exists for the code (`pricing/src/app/actions.ts:5901-6029`). This scope is a critical current-target divergence.

### 6.4 Follow-up workflow

Follow-ups are `Pending` or completed outcomes and have due date, channel and notes. Completing one may create a next follow-up with a new due date/channel. Sending an enquiry quote creates exactly one pending Email follow-up due in 15 days for that enquiry/message (`pricing/src/app/actions.ts:6896-7036`).

### 6.5 PO and PI workflow

PO: Draft/open review -> price decisions -> PI Draft -> PI Sent -> Approved, with Cancelled allowed only before approval. Every PI-generation/approval line must have a matched quote, a non-null PI price, and a non-Pending decision. `Accept PO Price` creates Pending Costing Revision and no PI price until costing resolves it. `Keep Our Price` selects the stored system price (`pricing/src/app/actions.ts:6631-6758`).

PI approval is atomic: activate the exact historical quote, convert Q root/quoted children to internal identities, create order/drawing/website side effects, mark quote Ordered, then mark PI/PO Approved. Approved PI cannot be cancelled (`pricing/src/app/actions.ts:6791-6894`).

### 6.6 Bulk revision workflow

Bulk revisions are staged and completed once. Product-route fields are casting, alloy premium, extrusion cost, forging cost, machining, washing, checking, marking, plating, annealing, deburring, buffing, sealant, assembly operation and overhead. Customer-route fields are scrap rate, packing, shipping, purchase times, profit and conversion rate (`pricing/src/app/actions.ts:7147-7199`).

Process changes must be compatible with product/package process sources, using the source aliases at `pricing/src/app/actions.ts:7231-7255`. A product change expands through every direct and recursively nested active price. Children are recalculated before parents; old rows/snapshots remain unchanged.

### 6.7 ECN workflow

The source ECN states are `Pending Design`, `Pending Product Costing`, `Pending Costing`, and `Completed`. Once Design sends an ECN to costing, the Design view is locked. Product changes first pass through Product Costing. Each recursively affected active direct/package/assembly price then receives exactly one Keep Price Same or Revise Price decision. Completion is bound to the affected set and decision count (`pricing/src/app/actions.ts:8833-9232`; `pricing/tests/audit-regression.test.mjs:438-506`).

## 7. Calculation contract

The canonical source calculation is `pricing/src/lib/costing.ts:55-108`, already copied to `packages/db/src/pricing-calculation.ts` and characterized by `apps/web/lib/pricing/costing.test.ts:38-71`.

Given product inputs and quote inputs:

```text
piecesPerKg = weight100Pcs > 0 ? 1000 / weight100Pcs : 0
netRateWithoutAlloy = scrapRate + extrusionCost + forgingCost
netRateWithAlloy = scrapRate + alloyPremium + extrusionCost + forgingCost
scrapRatePerGm = netRateWithoutAlloy / 1000
rawMaterialCost = purchaseTimes * netRateWithAlloy
                + (casting - purchaseTimes) * netRateWithoutAlloy
scrapReturn = casting - 1
scrapReturnPriceIncludingBurningLoss = scrapRate * (1 - burningLossPercent)
scrapReturnPrice = scrapReturn * scrapReturnPriceIncludingBurningLoss
totalRodsCost = rawMaterialCost - scrapReturnPrice
rejectionCost = totalRodsCost * rejectionPercent
processCost = machining + washing + checking + marking + plating + annealing
            + deburring + buffing + sealant + assemblyOperation
            + productOverhead + packing + shipping + quoteOverhead
totalA = processCost + totalRodsCost + rejectionCost
profitB = totalA * profitPercent
totalAPlusB = totalA + profitB
rateInr = piecesPerKg > 0 ? totalAPlusB / piecesPerKg : 0
totalRateInr = rateInr + assembledPartInr
rateInCurrency = conversionRate > 0 ? totalRateInr / conversionRate : 0
```

All non-finite results become zero. Other exact rules:

- Machining price/piece = machining cost / pieces/kg.
- Direct-purchase price/piece = direct-purchase price/kg / pieces/kg.
- Grade+rod type supplies alloy premium and extrusion cost when the form leaves them blank.
- Barstock forces forging cost and assembly operation cost to zero in the completed product-costing path, as characterized by `packages/db/src/commercial-costing.integration.test.ts:171-282`.
- Direct Purchase uses direct-purchase price/piece as stored product cost.
- For a derived non-direct product, the current source update path persists `machining_price_per_piece` as `product_cost_inr`, not the full calculated total (`pricing/src/app/actions.ts:4565-4570`; `pricing/docs/costing-formula-audit.md:68-85`). This counterintuitive storage boundary is an unchanged-behavior oracle, not permission to implement the formula audit's proposed future fix.
- Package/Assembly cost rolls up immediate child quote costs by BOM quantity, then applies the parent's own process/rejection/profit. Nested BOM parents receive their own child quote/snapshot; a root stores only immediate children.
- Percent-form inputs use whole percentages in the browser and decimals in repositories/storage.
- The approved source price follows the calculated converted price unless a specific revision/PO flow supplies a source-supported override.
- Historical quote calculation JSON and product/component snapshots are immutable after send.

## 8. Invariants, validations, and side effects

### 8.1 Identity and historical invariants

- Q-to-internal conversion retains `converted_from_quote_uid` and keeps workflow joins resolving through either current UID or former Q identity (`pricing/tests/audit-regression.test.mjs:99-140`).
- Sent timestamps survive ordering and later revisions.
- `price_master` is never written or consulted for active PO prices.
- Source package snapshots contain exactly immediate children. Existing snapshots are not deleted/rebuilt; historical parents may not point to future or superseded children (`pricing/tests/audit-regression.test.mjs:198-254`).
- Pricing displays internal UID for ordered rows but keeps customer-line quote status semantics (`pricing/tests/audit-regression.test.mjs:300-331`).
- Sent quote PDF selects historical sent rows, not a later active revision (`pricing/tests/audit-regression.test.mjs:256-265`).
- Customer-code collision and lineage behavior must be reconciled before changing the target uniqueness constraint.

### 8.2 Import invariants

- Part and description are mandatory for classified enquiry import rows.
- Classification priority is exact quoted match, in-progress match, partial-code possibility, exact-description Sales check, then new line.
- Applying an import review is idempotent. Each source row is applied at most once.
- Link to existing work requires a matched enquiry item; Commercial Requote requires a matched product; Ask Sales opens a clarification.
- Master and PO imports must be atomic; rejected rows must not leave partial canonical state.

### 8.3 File and attachment invariants

- Source file kinds are customer enquiry drawing; Design internal drawing; Design customer-marked drawing; Design CAD; and PO source file.
- Target attachment metadata records organization, target, safe base filename, storage key, media type, byte size and SHA-256. Bytes stay in ignored local storage for this local-first release.
- Reject traversal/unsafe base names, enforce bounded size, create bytes with exclusive write, and delete newly written bytes if the PostgreSQL metadata transaction fails (`apps/web/app/commercial/enquiries/actions.ts:57-115`).
- Every inline download performs Better Auth capability and organization checks and serves the original media type with an escaped filename.
- Replacing source-design/enquiry file fields must retain auditable prior metadata; do not overwrite bytes in place.

### 8.4 Required side effects

- Quote send: activate price, supersede correct prior scope, create one 15-day follow-up.
- PI approval: activate selected historical quote; convert Q root and quoted package children; create drawing-history and website-product entries; sync assembly fields; stamp order/approval.
- Product and bulk change: recursively revise all active dependent direct/package/assembly prices.
- Technical/Design clarification: create or resolve the right task and move the owning queue state.
- Corrections/reversals: retain correction type, entity, reference, before/after and remarks.
- Every target command records authenticated actor and durable audit event in the same PostgreSQL transaction.

## 9. Route, screen, report, import, and export contract

The target must provide source-equivalent destinations within `/commercial`; exact target URLs may differ, but links, bookmarks within the new shell, capabilities, and all workflows must remain discoverable.

| Source screen/output                                                            | Required target function                                                                            |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/`, `/customers`, `/masters`                                                   | Commercial analytics, customer CRUD, all pricing-master CRUD/import/template.                       |
| `/sales`, `/sales/history` and three history exports                            | Sales queues, clarification, quote send, follow-up workbench/history, combined/sent/follow-up XLSX. |
| `/enquiries`, `/enquiries/[id]`, `/enquiries/spreadsheet`                       | Register/detail/edit/delete, line CRUD/drawing, import review, spreadsheet filters and export.      |
| Enquiry CSV/XLS/XLSX templates and exports                                      | Preserve source headers, ordering, calculated-column omissions and filenames.                       |
| `/technical-review`, `/design-tasks`, Design file routes                        | Dedicated queues, complete Design editor/BOM, internal/customer/CAD downloads.                      |
| `/products`, `/assemblies`, `/quotes`                                           | Product queue/register, Assembly register, full customer-costing workbench.                         |
| `/quotes/enquiry/[id]/pdf`                                                      | Historical quote PDF with terms and external-rate fallbacks.                                        |
| `/pricing`, `/pricing/revisions`                                                | Current price and historical revisions spreadsheet views and XLSX export.                           |
| `/po-pi`, `/po-pi/[id]`                                                         | PO register/detail/file, match/decision/revision/PI lifecycle.                                      |
| PO template, detail XLSX, PI PDF/XLSX, PO master and approved-PI master exports | Exact sheets, fields, percent display, filenames and source row selection.                          |
| `/bulk-revisions/product`, `/bulk-revisions/customer`, detail screens           | Separate route semantics, selection/preview/staging/completion.                                     |
| `/ecns`, Design ECN, Costing ECN                                                | Full multi-stage ECN and affected-price decisions.                                                  |
| `/corrections`                                                                  | Source reversals/log plus target historical-change quarantine.                                      |
| `/drawing-history` + export                                                     | Drawing revision maintenance and XLSX.                                                              |
| `/website-products` + export                                                    | Website catalog maintenance, derived codes/status/assemblies and XLSX.                              |

Calculated status columns must remain excluded where the source export regression requires it (`pricing/tests/export-status-regression.test.mjs:9-52`). Client exports that hide displayed system columns must keep that exclusion behavior.

## 10. Authorization mapping

| Source page group                                   | Target read                     | Target write                     |
| --------------------------------------------------- | ------------------------------- | -------------------------------- |
| Dashboard                                           | `pricing.dashboard.read`        | none                             |
| Masters, customers, product/website/drawing masters | `pricing.masters.read`          | `pricing.masters.write`          |
| Sales/follow-ups                                    | `pricing.sales.read`            | `pricing.sales.write`            |
| Enquiries/imports/attachments                       | `pricing.enquiries.read`        | `pricing.enquiries.write`        |
| Technical Review                                    | `pricing.technical_review.read` | `pricing.technical_review.write` |
| Design                                              | `pricing.design.read`           | `pricing.design.write`           |
| Product/customer costing                            | `pricing.costing.read`          | `pricing.costing.write`          |
| Quote register/PDF/send                             | `pricing.quotes.read`           | `pricing.quotes.write`           |
| PO/PI                                               | `pricing.purchase_orders.read`  | `pricing.purchase_orders.write`  |
| Bulk revisions/ECN                                  | `pricing.revisions.read`        | `pricing.revisions.write`        |
| Corrections                                         | `pricing.corrections.read`      | `pricing.corrections.write`      |

The current target's use of `pricing.costing.read/write` for orders and revisions is a defect, not an alternate mapping (`apps/web/app/commercial/orders/**`, `apps/web/app/commercial/revisions/**`).

## 11. Existing target coverage and explicit gaps

### 11.1 Covered foundations to retain

- PostgreSQL schemas, source provenance and the 628 Pricing source mappings.
- Better Auth identity, actors, roles and seeded Pricing capabilities.
- Exact audited costing engine copy and core product/quote calculation tests.
- Core enquiry handover, technical clarification, Design save, attachment metadata and costing handoff repositories.
- Recursive Package/Assembly quote snapshots and immutable sent history.
- Core PO/PI transaction path and immutable issued PI lines.
- Recursive bulk/ECN quote replacement infrastructure.
- Append-only audit events, local file storage convention, shadcn commercial shell.

### 11.2 Blocking divergences

1. **Active-price scope:** source current code supersedes customer+code; target constrains customer+code+lineage.
2. **Enquiry import:** source classifies and pauses for row decisions; target automatically creates every row.
3. **Sales clarification:** source supports commercial match, technical revision, line/drawing updates and shortcuts; target records response only.
4. **Design UI/data:** source captures a full nested BOM and Design dossier; target UI sends one synthetic row.
5. **Bulk revision fields:** source supports 21 fields with route allowlists/process guards; target supports 9 and three product fields.
6. **ECN state machine:** source has Product Costing stage and full product/BOM change; target jumps Design to customer decisions and exposes description only.
7. **Corrections:** source permits specific safe reversals; target only quarantines historical rewrite/delete.
8. **PO ambiguity:** source code returns an ordered best match while docs/audit claim ambiguous lineages do not auto-match; target rejects ambiguity. This must be resolved from archived-data rehearsal and current source UI behavior before parity is declared.
9. **Quote send side effect:** target does not create the source 15-day follow-up.
10. **PI approval side effects:** target lacks complete drawing-history and website-product behavior.
11. **Authorization:** orders/revisions use costing capabilities rather than their seeded capabilities.
12. **Weight semantics:** source operators enter one-piece grams and the formula computes `1000 / weight`; target labels the same persisted field as weight per 100 pieces, producing a 100x input error.
13. **Derived stored cost:** current source persists machining price as `product_cost_inr` for derived products. Any cleaner target storage semantics are a functional change unless separately approved after parity.

### 11.3 Missing product surfaces

Customer/master CRUD; all master imports/templates; enquiry update/delete and review UI; dedicated Technical/Design/Sales queues; full Design files/BOM; Assembly register; quote PDF; Pricing spreadsheets; follow-ups; report/export suite; Drawing History; Website Product Data; correction candidates/reversals; complete dashboard analytics.

## 12. Dependency graph

```text
Better Auth organizations/users/capabilities
  -> customer + pricing masters
  -> enquiry header + line + attachments
  -> Technical Review <-> Sales clarifications/follow-ups
  -> Design dossier + files + nested design BOM
  -> catalog items + canonical BOM
  -> Product Parameter Costing
  -> Customer Parameter Costing
  -> immutable quote/product/component snapshots
  -> quote send + active price + follow-up
  -> PO matching/decision -> costing revision if needed
  -> PI issue/approval
  -> Q-to-M/P conversion -> drawing history + website products

active sent/ordered quote trees
  -> bulk customer/product revisions
  -> ECN Design -> Product Costing -> customer decisions
  -> Pricing current/revision registers and exports
  -> PO matching and every historical document

attachments/files + audit events + correction evidence
  -> all commands and document routes
```

No phase may implement a downstream writer against a temporary second source of truth.

## 13. Phased implementation plan

Each phase is a reviewable ticket group. TDD means the first committed artifact for each behavior is a failing characterization/integration test, followed by the minimum implementation and then refactoring without behavioral changes.

### Phase LM-00 — Freeze behavior and reconciliation fixtures

- Map the 45 executable Pricing regression test cases plus the canonical costing/formula boundary to 46 behavior-oriented target test IDs rather than source-text regex tests.
- Create deterministic PostgreSQL fixtures from the archived Q/product/package/assembly, quote, PO and ECN relationships.
- Add golden JSON/XLSX/PDF metadata fixtures for every source output.
- Run the source audit script against an immutable archive copy and store only the summarized reconciliation result.
- Resolve or formally record the active-price and ambiguous-PO contradictions before schema changes.

Gate: every row in Sections 5 and 11 has a test ID and confirmed source oracle.

### Phase LM-01 — Correct authorization and behavioral drift

- Fix order/revision/correction page/action capabilities.
- Implement source active-price scope and migrations only after LM-00 decision.
- Replace target auto-import with the source classifier/review state machine.
- Add quote-send follow-up and missing audit side effects.
- Restore safe correction reversals alongside quarantine.

Gate: all blocking divergences except Design/bulk/ECN breadth have red-to-green tests.

### Phase LM-02 — Master and customer maintenance

- Customer CRUD.
- All pricing/design/website/terms masters CRUD.
- Master workbook template/import and conflict/error reporting.
- Organization-scoped uniqueness and actor auditing.

Gate: source master fixture round-trips through target export/import without canonical diffs.

### Phase LM-03 — Enquiry, Sales, Technical and follow-up parity

- Enquiry/register/line update-delete gates and drawing replacement/download.
- Full import parser/classifier/review UI.
- Dedicated Sales and Technical queues.
- Full Sales clarification decisions and follow-up lifecycle/history.
- Enquiry/register/templates/exports.

Gate: new, duplicate, in-progress, possible-code and description-match scenarios end in identical source states and side effects.

### Phase LM-04 — Full Design dossier and handoffs

- Dedicated Design queue, portfolio/package selectors and Q/C allocation.
- All Design fields, requirement costs, approval fields and three attachment kinds.
- Nested Package/Assembly BOM editor with source validation.
- Technical/Design/Costing clarification directions and handoff reversal.

Gate: List, Package, nested Assembly and existing-portfolio scenarios produce the same products, BOM and states.

### Phase LM-05 — Product/customer costing and commercial documents

- Complete Product and Assembly registers and product-costing inputs/backflow.
- Full customer-costing inputs, child/package/assembly editors and source defaults.
- Quote send/register; Pricing and revision spreadsheets.
- Historical quote PDF with deterministic live-rate adapters/fallback tests.

Gate: all formula intermediates and snapshot trees reconcile within exact numeric storage precision; sent documents select the source-equivalent historical rows.

### Phase LM-06 — PO/PI files, outputs and order side effects

- PO source-file upload/download.
- Exact PO matching outcome decided in LM-00.
- PO template/detail export, PI PDF/XLSX, PO/Approved PI master exports.
- Complete Q conversion, Drawing History and Website Product creation side effects.

Gate: unmatched, Keep Price, Accept PO Price, ambiguous and approved/cancel scenarios match source states/documents.

### Phase LM-07 — Bulk revisions, ECN and corrections

- Full source bulk field matrices, process aliases/guards, selection, previews, staged deletion and completion.
- Full ECN Design/BOM, Product Costing stage, previews and per-price decisions.
- Corrections register/candidates/reversal/quarantine.

Gate: direct, Package, Assembly and two-level nested Package fixtures revise in child-before-parent order without changing historical digests.

### Phase LM-08 — Website, drawing, analytics and final registers

- Full Drawing History and Website Product screens/exports.
- Derived part code, material/thread/assembly/status sync.
- Source Pricing dashboard analytics and remaining register filters/exports.

Gate: archived drawing/website rows and all analytics reconcile; no missing source screen/output remains.

### Phase LM-09 — Full acceptance and source retirement readiness

- Run unit, repository integration, HTTP, browser, accessibility, responsive and Redis-loss tests.
- Run Pricing workflow audit equivalents and archived-data reconciliation.
- Verify every target route uses Better Auth and PostgreSQL only.
- Verify `pricing` has no required runtime role; retain it read-only until retention approval.

Gate: Section 15 passes with no unsigned exception.

## 14. Test oracles

### 14.1 Mandatory source oracles

- All assertions in `pricing/tests/audit-regression.test.mjs:76-518`.
- Export behavior in `pricing/tests/export-status-regression.test.mjs:9-52`.
- All 57 workflow data checks and known findings from `pricing/scripts/audit-workflow-rules.py:27-1121`. The source script currently reuses `PACKAGE-010` for two different checks; target IDs must remain unique while retaining both source references.
- Costing formula map and known boundary risks in `pricing/docs/costing-formula-audit.md`.
- Workflow scenario matrix and known archive exceptions in `pricing/docs/workflow-audit.md`.

### 14.2 Existing target tests to retain and deepen

- Enquiry/Design workflow: `packages/db/src/commercial-workflow.integration.test.ts:62-265`.
- Product/quote/package costing: `packages/db/src/commercial-costing.integration.test.ts:171-430`.
- PO/PI: `packages/db/src/commercial-orders.integration.test.ts:99-320`.
- Bulk/ECN/corrections: `packages/db/src/commercial-revisions.integration.test.ts:183-340`.
- Formula engine: `apps/web/lib/pricing/costing.test.ts:38-71`.
- Better Auth role/capability administration: `apps/web/lib/auth/access-administration.integration.test.ts`.

Each target integration test must assert canonical rows, historical rows, actor audit events, and side effects. Static source-text matching is not sufficient target acceptance.

## 15. Reconciliation and acceptance gates

1. **Source accounting:** all 36 Pricing source tables and every source row remain mapped or explicitly excluded with reason. Existing migration hash/count reconciliation stays green.
2. **Capability accounting:** all 74 source write entry points are either implemented or explicitly classified as adjacent HR/out-of-scope by signed decision.
3. **Screen/output accounting:** every Pricing page and every download route in Section 9 has a target route and capability test.
4. **Workflow parity:** new List, portfolio match, Package, Assembly-in-Package, clarification, revision, PO and ECN scenarios produce equivalent state/event sequences.
5. **Calculation parity:** every intermediate value in Section 7 matches exact source rounding/storage behavior; zero weight and zero conversion never emit non-finite values.
6. **Historical parity:** sent PDFs, active prices, ordered rows, package snapshots, supersession links and PI lines select the correct historical records.
7. **Revision parity:** direct and recursively dependent prices are revised exactly once; source snapshots retain identical digests.
8. **File parity:** all migrated file metadata resolve; every new file can upload/download; traversal, unauthorized access and metadata-failure cleanup tests pass.
9. **Report parity:** workbook sheet names, headers, order, filters, calculated-column omissions, percent display, filenames and PDF content match golden fixtures.
10. **Authorization:** anonymous, read-only, wrong-module and write-capable users are tested for every route/action family.
11. **Infrastructure:** PostgreSQL remains canonical with Redis stopped; no runtime SQLite/Convex import; Better Auth sessions and Pricing reads/writes remain correct.
12. **UI acceptance:** desktop and 390px browser flows pass with no overflow, console error or inaccessible control; only shared shadcn primitives/theme are used.
13. **Quality:** workspace typecheck, lint, all package tests, production build and end-to-end workflows pass.
14. **Exceptions:** the known archive anomalies are preserved as signed reconciliation exceptions, not silently repaired during logic migration.

## 16. Known exceptions and contradictions

1. Pricing documentation dated 2026-07-05 says active uniqueness and PO ambiguity are product-lineage aware. Current `activateQuotePrice` and current regression assertions scope active supersession by customer+code without lineage, while current `findPoQuoteMatch` returns a ranked `LIMIT 1`. The target is lineage-aware and rejects ambiguity. This is the highest-risk blocking decision.
2. Archived customer code `32046` is documented against multiple product lineages. Do not use this anomaly to silently choose a policy; replay the source action/UI and obtain an explicit acceptance decision.
3. Source audit documents active blank-code child quote rows that are not attached to active parents. Preserve them as historical evidence; do not attach or supersede them during logic work without a separate correction decision.
4. Quote rows 17–20 inherit sent timestamps. Historical PDF and current-price queries intentionally have different precedence.
5. `price_master` exists only as legacy schema and must remain unused.
6. HR Recruitment is represented by proxy/UI permissions but its separate source service/data were not in the two-repository audit.
7. The formula audit describes a desired future product-cost boundary change. That recommendation is not authorized under no-functional-change; current executable calculations and tests remain the migration oracle.
8. Live Westmetall and Frankfurter calls are part of quote-PDF behavior but are operationally unstable. Preserve their no-store request and fallback semantics behind an injectable adapter; do not make quote generation fail when either service is unavailable.

## 17. Risks and mitigations

| Risk                                        | Impact                                                            | Required mitigation                                                              |
| ------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Treating migrated rows as migrated behavior | Missing workflows despite green data reconciliation.              | Capability/output accounting plus browser scenarios.                             |
| Target “hardening” changes source outcomes  | Violates no-functional-change and can alter active prices/orders. | LM-00 characterization and explicit decisions before constraint changes.         |
| Broad repository methods hide UI omissions  | Backend tests pass while users cannot execute source paths.       | Test browser-visible fields/actions and dedicated queues.                        |
| Recursive package revision error            | Historical price corruption across nested assemblies.             | Immutable digest tests and child-before-parent fixtures.                         |
| Spreadsheet/PDF drift                       | Operations cannot reconcile with established workbooks.           | Golden files/metadata, exact headers/order/selection tests.                      |
| File path or authorization defect           | Data exposure or lost local attachments.                          | Safe storage key, organization ownership, SHA-256, cleanup and capability tests. |
| Live market/FX outage                       | Quote PDF missing or blocked.                                     | Preserve source fallback behavior and record adapter tests.                      |
| Capability aliasing                         | Users gain order/revision access through Costing.                 | Exact mapping in Section 10 and denied-path integration tests.                   |
| Concurrent active-price/revision writes     | Duplicate active prices or revision numbers.                      | Advisory/row locks and unique constraints aligned to the resolved source rule.   |

## 18. Decision status and remaining approvals

1. **Resolved in LM-00:** current executable source behavior is authoritative. Nonblank active prices supersede by organization/customer/normalized customer code; blank codes retain enquiry-item lineage. PO matching returns the source-ranked first valid candidate rather than rejecting ambiguity.
2. **Resolved dependency boundary:** HR Recruitment is an external proxied Python service whose repository and data were not present in either supplied project or export. The migration must preserve the proxy boundary and cannot claim that external data was migrated without a separately supplied source.
3. **Resolved in LM-00:** live Westmetall/Frankfurter quote-PDF behavior remains live/no-store with source-equivalent fallback semantics. Persisting fetched rates would be a functional change.
4. **Implementation chosen, acceptance pending:** attachment bytes use ignored local storage and PostgreSQL retains metadata, ownership, size, MIME type, and SHA-256. LM-09 must prove the accepted backup/restore procedure for the local attachment root.
5. **Still requires retirement approval:** classify each known archive warning as a signed exception or a required correction before source retirement.

## 19. Definition of delivered

The Pricing business-logic migration is delivered only when all phases are implemented, all Section 15 gates pass, all blocking contradictions have explicit decisions, all source capabilities and outputs are accounted for, the archived PostgreSQL data remains reconciled, and users can complete the full Enquiry -> Technical -> Sales clarification -> Design -> Product Costing -> Customer Costing -> Quote -> Follow-up -> PO -> PI -> internal product/drawing/website lifecycle in the MRM Dashboard without invoking the Pricing repository or changing its business outcomes.

## 20. Implementation checkpoint — 2026-07-21 pause

LM-00 is complete and LM-01 remains in progress on `feat/logic-migration`.

Implemented LM-01 behavior at this checkpoint:

- Dedicated Better Auth capability boundaries for commercial navigation,
  orders, quotes, revisions, and corrections.
- Source-compatible ranked PO matching and transaction-locked active-price
  supersession, including the separate blank-code lineage rule.
- Six persisted source import classifications, explicit operator decisions,
  idempotent application, and a shared-shadcn review surface that no longer
  auto-creates every imported line.
- Atomic quote-send follow-ups with the source 15-day due date, Email channel,
  exact note, and resend behavior.
- Safe design-handoff and unused quoted-product reversals with before/after
  audit evidence, plus append-only quarantine for historical quote changes.
- Pricing archive transformation of import-review actions, match notes, and
  deferred source-ID relationship restoration.

Verification completed before pausing:

- Pricing snapshot transform integration: 1 passing test.
- Schema contract including migrations `0023` and `0024`: 12 passing tests.
- Commercial authentication/capability tests: 5 passing tests.
- Migration, database, and web package typechecks: passing.
- A combined six-file commercial database run passed 22 tests, then all three
  workflow tests failed after a shared-database deadlock and cascading missing
  fixtures. This is an unresolved test-isolation finding, not an accepted
  application failure or a proven harness-only defect. The next action is to
  reproduce `commercial-workflow.integration.test.ts` alone before modifying
  production code.

Operational state at pause:

- Main `mrmpl` has not yet applied migrations `0022`-`0024` and has not run the
  final import-review relationship backfill; only the isolated test database
  was used for the new schema-contract run.
- Docker Compose PostgreSQL and Redis containers are stopped. Their volumes
  were not removed.
- No Next.js app, runtime worker, Vitest process, or other mrm workspace server
  remains running. A Convex process in `/home/raajveer/Documents/Code/vb/erp`
  was observed and deliberately left untouched because it belongs to another
  project.
- Untracked generated `*.d.ts.map` files from an earlier malformed typecheck
  remain for a later exact dry-run cleanup; no source or user file should be
  removed with them.

## 21. LM-01 and LM-02 completion checkpoint — 2026-07-21

LM-01 and LM-02 are complete on `feat/logic-migration`. Work pauses before
LM-03.

The LM-01 combined-suite failure was a test-harness defect, not a commercial
workflow defect. The Better Auth reset helper used `TRUNCATE ... CASCADE` on
identity tables, which followed incoming foreign keys and deleted unrelated
business fixtures. It now deletes only sessions, accounts, and users inside a
transaction, and a sentinel-organization regression protects the boundary.
The commercial workflow passes in isolation and in the serial phase gate.

LM-02 delivers:

- Authorized, organization-scoped customer create and update behavior with
  managed numeric UIDs, source provenance, row versions, and actor audit.
- CRUD for material grades, rod and machine types, categories/subcategories,
  processes, website applications/certifications/field options, material
  rates, shipping and packaging options, commercial terms, and ordered quote
  PDF term templates.
- Case-insensitive source natural keys, grade-plus-rod material lookup,
  activation without historical deletion, source defaults, and term ordering.
- Exact source workbook sheet names and template filename, XLS and XLSX alias
  parsing, transformations/defaults, canonical export, actionable row errors,
  and one-transaction multi-sheet import.
- Shared-shadcn maintenance screens with server-side Better Auth capability,
  organization, and actor resolution.

Acceptance evidence:

- The empty-organization integration fixture bootstrapped all 15 representative
  customer/master rows and recorded the authenticated actor for every event.
- A missing category reference in Sub Categories rolled back the whole import.
- The canonical source fixture exported and re-imported without a snapshot
  difference; browser acceptance also re-imported a live export with 0 new and
  10 updated rows.
- Browser checks covered customer create/update, representative dependent
  masters, activation, exact `masters-template.xlsx` delivery, live export,
  atomic import, and a 390px viewport with no horizontal overflow or console
  error.
- Migration `0025_commercial_master_maintenance.sql` is applied to main
  `mrmpl`; all 628 archived Pricing source mappings remain present.
- The focused gate passed 33 serial database tests, one Pricing snapshot
  transform test, nine web authorization/workbook tests, and package
  typechecks/lint. Final workspace gates are recorded in `migration.json`.
- At the requested pause, the browser and Next.js sessions are closed and the
  Docker PostgreSQL/Redis containers are stopped with their volumes retained.
  No LM-03 implementation has started.
