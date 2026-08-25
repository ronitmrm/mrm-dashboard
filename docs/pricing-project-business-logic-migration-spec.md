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
| Customer Parameter Costing                 | Draft/in-progress quote creation, package/assembly recursive quoting, child inputs, terms, locked sent rows (`pricing/src/app/actions.ts:4782-5352`).                                                                                                                                                           | **Covered.** `/commercial/customer-costing` uses a bounded four-source queue and selected-item-only form; the PostgreSQL repository retains source defaults, recursive Package/Assembly inputs, direct-purchase suppression, Draft/Ready separation, PO target profit, sent-row immutability, and automatic exact-price PO resolution.                      | Keep repository integration coverage for every source input/default, package child/assembly profit editor, process restriction, draft update, explicit completion, and queue category.                                                   |
| Quote send and active-price activation     | Quote send stamps the enquiry's quoted rows, activates nonblank customer-code prices, supersedes prior prices, and creates one 15-day Email follow-up (`pricing/src/app/actions.ts:5901-6029`, `:6958-7036`).                                                                                                   | **Divergent/Partial.** Target sends and activates a lineage, but does not create the source follow-up. Target uniqueness is customer+code+lineage while current source activation supersedes by customer+code only.                                                                                                                                         | Characterize the archived collision rows, then reproduce current source scope unless explicitly approved otherwise. Create the idempotent 15-day follow-up in the send transaction.                                                      |
| Quote PDF                                  | Historical quote-row selection favors rows that existed when sent; PDF includes ordered lines, quote terms, current Westmetall Copper/Zinc and live currency/INR rate with fallbacks (`pricing/src/app/quotes/enquiry/[id]/pdf/route.ts:93-176`, `:414-560`).                                                   | **Missing.**                                                                                                                                                                                                                                                                                                                                                | Port PDF layout/content, historical selection ordering, inline filename, quote revision, live-rate failure behavior, and route capability. Add deterministic fixtures for the external-rate branches.                                    |
| Pricing and revision spreadsheets          | Current active pricing, revisions, packages/assemblies, formula columns, currency placement, date selection and client XLSX export (`pricing/src/lib/queries.ts:2859-3456`; `pricing/src/components/PricingSpreadsheetTable.tsx:1-716`).                                                                        | **Missing.**                                                                                                                                                                                                                                                                                                                                                | Port complete datasets, column order/labels, filters, client/server exports, calculated status omission, internal UID display, and historical revision view. Do not revive `price_master`.                                               |
| Product/Assembly registers                 | Product and assembly screens expose parameter state, task actions, BOM relationships and costing links (`pricing/src/app/products/page.tsx`, `pricing/src/app/assemblies/page.tsx`).                                                                                                                            | **Partial.** Read-only products list exists; no Assembly register or equivalent actions.                                                                                                                                                                                                                                                                    | Deliver source-equivalent product and Assembly registers backed by normalized tables.                                                                                                                                                    |
| Follow-ups and Sales queues                | Manual create/complete; completion can schedule the next follow-up; quote send creates a 15-day follow-up; Sales screen contains clarification, quote-ready/sent, follow-up and handover queues (`pricing/src/app/actions.ts:6896-7145`; `pricing/src/app/sales/page.tsx`).                                     | **Missing.**                                                                                                                                                                                                                                                                                                                                                | Port all queues, due logic, manual and chained follow-ups, channel/status defaults, quote-send side effect, histories and exports.                                                                                                       |
| PO import and price review                 | Create PO with optional file, manual/import lines, match active sent/ordered prices, preserve system-price snapshot, choose Keep/Accept, create quote request for unmatched lines (`pricing/src/app/actions.ts:6031-6705`).                                                                                     | **Covered backend / Partial product.** Repository and UI cover core path (`packages/db/src/commercial-orders.ts:432-1196`), but source file persistence/download and output routes are absent. Target ambiguous-match rejection may conflict with current source's ordered `LIMIT 1` selection.                                                             | Preserve source matching precedence and evidence after resolving the documented/code contradiction; add PO file and every source export.                                                                                                 |
| PI lifecycle                               | Generate only after nonempty, matched, decided lines; Draft -> Sent -> Approved; approval activates historical quote and converts Q products/children, then creates drawing/website records; approved PI cannot cancel (`pricing/src/app/actions.ts:6707-6894`).                                                | **Partial/Divergent side effects.** Core PI and Q conversion are covered (`packages/db/src/commercial-orders.ts:1198-1556`), but drawing/website side effects and output documents are incomplete.                                                                                                                                                          | Port exact side effects, gating and status labels; retain exact quote IDs/prices on PI lines; add PDF/XLSX and master exports.                                                                                                           |
| PO/PI reports                              | PO detail XLSX, PO template, PI PDF/XLSX, PO master and Approved PI master with exports (`pricing/src/app/po-pi/**`).                                                                                                                                                                                           | **Missing.**                                                                                                                                                                                                                                                                                                                                                | Preserve columns, percent formatting, sheets, document fields, filenames, inline/attachment disposition, filters and permissions.                                                                                                        |
| Bulk revisions                             | Customer and product routes, field allowlists, staged selection, previews, process guards, recursive direct/nested propagation, completion-once (`pricing/src/app/actions.ts:7147-8787`, `:8789-8831`, `:9234-9687`).                                                                                           | **Covered.** The revision repository exposes all 21 route-scoped fields, process aliases/guards, grouped multi-price staging, stored previews, stage deletion, child-before-parent immutable quote replacement and completion-once. `/commercial/customer-bulk-revision` provides the dedicated bounded customer workflow.                                  | Keep exact allowlists, value conventions, locked process aliases, previews, multi-row selection, deletion, recursive recalculation order, final IDs and bounded coverage tests.                                                          |
| ECN                                        | Register -> Pending Design -> Pending Product Costing -> Pending Costing -> Completed; Design edits product/BOM while locked after handoff; Costing decides Keep/Revise per recursively affected price (`pricing/src/app/actions.ts:8833-9232`; ECN previews in `pricing/src/lib/ecn-price-preview.ts:45-663`). | **Partial/Divergent.** Target has only Pending Design -> Pending Costing -> Completed and a description-only UI patch (`apps/web/app/commercial/revisions/page.tsx`; `packages/db/src/commercial-revisions.ts`).                                                                                                                                            | Restore Product Costing stage, full product/BOM design changes, affected-price preview math, exact decision semantics, field labels, locks and completion counting.                                                                      |
| Corrections register                       | Source supports Design handoff reversal, unused Q product reversal, technical-revision match logs and a unified log (`pricing/src/app/corrections/page.tsx`; actions above).                                                                                                                                    | **Divergent.** Target correction UX only quarantines historical quote rewrite/delete requests.                                                                                                                                                                                                                                                              | Keep target quarantine for forbidden history changes, and add all source correction types, candidate lists, blockers, transitions and register columns.                                                                                  |
| Drawing history                            | PI approval creates revision 0 drawing history; users update drawing number/revision/date and laminated quantities; register and XLSX export (`pricing/src/app/actions.ts:5389-5723`; `pricing/src/app/drawing-history/**`).                                                                                    | **Implemented.** The operational register shows one latest-revision row per Part with Excel-style column filters. Every saved change records before/after values in a separate chronological Drawing Change Log.                                                                                                                                            | Preserve creation side effect, unique product+revision storage, one-row-per-Part register, immutable change log, display date, and export.                                                                                               |
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

Follow-ups are `Pending` or completed outcomes and have due date, channel and notes. Completing one may create a next follow-up with a new due date/channel. The archived source created one pending Email follow-up due in 15 days when sending an enquiry quote (`pricing/src/app/actions.ts:6896-7036`). The approved MRMPL target workflow now requires Sales to choose the Follow-Up Date while sending the Quote, creates exactly one pending Email task linked to that Quote, and does not expose separate manual Follow-Up creation.

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
            + productOverhead + packing + shipping
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
- Package/Assembly Product Parameter Costing rolls up each immediate child's stored base cost by BOM quantity and adds the parent's unadjusted process cost per piece.
- Package/Assembly Customer Parameter Costing first preserves each child's recursively calculated Customer Price, including that child's own rejection and profit. The parent then calculates `parentRejection = parentProcessCost * parentRejectionPercent`, `parentProfit = (parentProcessCost + parentRejection) * parentProfitPercent`, and `parentPrice = childQuoteTotal + parentProcessCost + parentRejection + parentProfit`. Parent percentages never multiply `childQuoteTotal`. A root stores only immediate child snapshots.
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
| `/product-costing`, `/assemblies`, `/quotes`                               | Product costing queue, Assembly register, full customer-costing workbench.                          |
| `/quotes/enquiry/[id]/pdf`                                                      | Historical quote PDF with terms and external-rate fallbacks.                                        |
| `/pricing`, `/pricing/revisions`                                             | Complete customer-and-product pricing, revision history, and XLSX export.                            |
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

## 22. LM-03 completion checkpoint — 2026-07-22

LM-03 is complete on `feat/logic-migration`.

Delivered behavior:

- Enquiry and line corrections use the recovered edit/delete gates. A valid
  post-handover correction resets Technical fields, resolves open Sales work,
  removes an unconsumed Design BOM, and returns the task to its source state.
- Drawing replacement preserves every file-link revision. Current bytes are
  delivered only through a Better Auth capability check, organization-scoped
  metadata lookup, contained storage path, and no-sniff response.
- CSV, XLS, and XLSX line imports preserve physical row numbers and pass all
  rows through explicit new, duplicate, in-progress, possible-code,
  description-match, and invalid-row decisions before application.
- Dedicated Sales and Technical Review pages expose source queue ordering,
  six fixed Technical checks, commercial-requote and technical-revision
  matching, line/drawing corrections, and manual or chained follow-ups.
- Enquiry register import is atomic, resolves Customer UID before an exact
  unique company name, updates only source-editable ENQs, and creates new ENQs
  with source defaults. Register, line, and Sales history workbooks preserve
  the recovered headers, sheet names, and filenames.

Acceptance evidence:

- The real-PostgreSQL commercial workflow gate passed 56 tests, including all
  five classifier outcomes, edit/delete locks, post-handover reset effects,
  drawing history, both Sales match branches, dedicated queues, chained
  follow-ups, and register rollback after a later invalid row.
- The web gate passed 145 tests, including physical-row/alias parsing and exact
  template/export metadata. Database, web, and workspace typechecks passed;
  lint completed with the four pre-existing dashboard warnings; diff checking
  and the complete Next.js 16.2.6 production build passed.
- The installed `agent-browser` skill could not execute because its matching
  CLI is not installed on PATH, so this checkpoint has no new browser recording.
  All new pages and authenticated output handlers compiled as dynamic routes.

## 23. LM-04 completion checkpoint — 2026-07-22

LM-04 is complete on `feat/logic-migration`.

Delivered behavior:

- Migration `0026_design_dossier_parity.sql` stores the complete recovered
  Design assignment, internal-part, BOM requirement, tooling, fixture, gauge,
  checking, approval, revision, and completion dossier.
- The dedicated Design queue exposes only Technical-released or explicitly
  reopened work, locks handed-off tasks, and offers ordered internal products
  for portfolio and existing-component selection.
- New List and Package work allocates organization-scoped Q and C identifiers;
  new Package Assembly and List rows allocate A and Q identifiers atomically.
- Multi-row BOMs preserve Assembly nesting, reject List parents, reject
  non-ordered/external existing components, and materialize the same nested
  catalog graph during Product Costing handoff.
- Internal drawing, customer-marked drawing, and CAD files use normalized
  organization-owned file metadata, append-only links, contained local paths,
  Better Auth delivery, and metadata-failure byte cleanup.
- Design-to-Technical and Product-Costing-to-Design clarifications preserve
  source queue states and blockers. The existing safe costing-handoff reversal
  remains the correction seam.

Acceptance evidence:

- The real-PostgreSQL gate passed 57 tests, including List, existing-portfolio,
  Package, nested Assembly, invalid nesting, ordered-component, dossier,
  attachment, queue, clarification, and catalog materialization assertions.
- The web gate passed 145 tests. Database and web typechecks and lint passed,
  with only the four pre-existing dashboard warnings.
- Migration 0026 is applied to main `mrmpl`; runtime verification reports
  PostgreSQL and Redis ready. The database gate was run serially because the
  shared integration database is intentionally incompatible with concurrent
  web identity-fixture mutation.

## 24. LM-05 completion checkpoint — 2026-07-22

LM-05 is complete on `feat/logic-migration`.

Delivered behavior:

- Product and customer costing expose every recovered List, Direct Purchase,
  Package, Assembly, child, commercial, percentage, FX, and process input.
  One-piece weight is explicitly grams, while Product Costing backflow accepts
  only an unsent Draft-equivalent quote and records the actor in the same
  transaction.
- The Assembly/BOM register preserves Parent, Parent Description, Component,
  Component Description, Qty, and Notes ordering. Its write command accepts
  only Package/Assembly parents, rejects self/cross-organization/cyclic links,
  and atomically creates audit evidence.
- Current Pricing and historical revision views traverse immutable quote
  snapshot trees through ten levels, retain parent/depth/quantity identity,
  display the source spreadsheet column order, convert stored decimal
  percentages for display, and export exact `Pricing View` /
  `pricing-view.xlsx` metadata.
- Historical quote PDF selection retains an originally sent quote after it is
  superseded. PDF generation includes commercial terms and injectable no-store
  Westmetall/Frankfurter adapters; an unavailable source yields `-` for metal
  rates and the saved enquiry conversion rate for FX without blocking output.

Acceptance evidence:

- The serial real-PostgreSQL gate passed 58 tests, including exact formula
  boundaries, immutable recursive Package/Assembly snapshots, active-price
  serialization, sent-history locks, recursive register rows, historical PDF
  precedence, and unsent/sent backflow behavior.
- The web gate passed 148 tests, including the PDF adapters/offline fallback,
  valid PDF bytes, exact workbook sheet/header/filename and percentage display,
  and route-capability mappings.
- Workspace typecheck and lint passed; lint retains only the four documented
  pre-existing dashboard warnings. The Next.js 16.2.6 production build passed
  with the documented local PostgreSQL and Better Auth environment and compiled
  every Assembly, Pricing, revision-export, and quote-PDF handler as dynamic.

## 25. LM-06 completion checkpoint — 2026-07-22

LM-06 is complete on `feat/logic-migration`.

Delivered behavior:

- Customer PO files are checksum-backed normalized `core.files` evidence.
  Upload failure removes the newly written bytes, replacement changes only the
  current PO link, retained file/audit rows remain append-only, and authenticated
  download resolves only a contained `LOCAL_FILE_STORAGE_PATH` path.
- PO import uses the LM-00 ranked source matcher and retains unmatched,
  difference, Keep Our Price, Accept PO Price/revision-request, PI Draft, Sent,
  Approved, and pre-approval Cancelled outcomes without recalculating historical
  quote IDs or PI prices.
- PI approval traverses the immutable quote-snapshot tree recursively, converts
  every Q identity to organization-scoped M/P state, creates revision-0 Drawing
  History for each Q conversion, creates active In Progress Website Product
  rows for ordered quote products, creates inactive In Progress rows for
  BOM-adjacent products, and records ordered audit evidence in the same
  PostgreSQL transaction.
- Authenticated routes now emit exact `po-line-import-template.xlsx`,
  `<po>-po.xlsx`, `<pi>-pi.xlsx`, `<pi>.pdf`, `po-master.xlsx`, and
  `approved-pi-master.xlsx` artifacts with source sheet names, field order,
  percentage display, selection, disposition, and column widths.

Acceptance evidence:

- The serial real-PostgreSQL gate passed 60 tests, including unmatched and
  differing decisions, immutable PI evidence, approved cancellation rejection,
  retained PO files, two-level quoted Package conversion, three Drawing History
  rows, ordered Website Product rows, BOM-adjacent inactive entries, and audit
  evidence.
- The web gate passed 298 tests, including exact PO/PI sheet names, headers,
  totals, percent display and PDF metadata. Workspace typecheck, lint, and diff
  checking passed; lint retains only the four documented pre-existing dashboard
  warnings.
- The Next.js 16.2.6 production build passed and compiled all seven new
  authenticated PO/PI file and report handlers as dynamic routes. The known
  Turbopack NFT filesystem-tracing warning remains non-blocking.

## 26. LM-07 completion checkpoint — 2026-07-22

LM-07 is complete on `feat/logic-migration`.

Delivered behavior:

- Bulk revisions expose the exact 15 product and six customer fields, preserve
  whole-percentage input only for Profit %, retain the source process aliases
  and compatibility guards, stage multiple selected active prices as one
  deletable group, show stored price previews, and apply every staged field
  once. Recursive revisions remain child-before-parent, record their order and
  final IDs, and never alter the source quote or snapshot digest.
- ECNs now retain Pending Design, Pending Product Costing, Pending Costing, and
  Completed. Design accepts the complete allowlisted product patch plus an
  organization-scoped, positive-quantity, unique and cycle-safe replacement
  BOM; before/after product and BOM evidence is stored before the Design view
  locks. Product Costing accepts every source costing input and freezes the
  recursively affected active-price set before customer decisions begin.
- Each frozen price exposes deterministic Keep Price Same and Revise Price
  previews. Keep Price Same recomputes the required profit against the changed
  product/BOM while preserving the historical price; Revise Price preserves
  the recalculated profit basis and emits the recalculated price. Exactly one
  append-only decision is accepted per affected source price.
- Corrections retain source-safe Design-to-Costing and unused-Q-product
  reversals with complete blocker rechecks. Pending candidates, blocker counts,
  completed reversal/technical-match evidence, and forbidden historical-price
  quarantine remain visible through the same correction repository/register.

Acceptance evidence:

- The serial real-PostgreSQL gate passed 64 tests, including the exact 21-field
  matrix, inspection alias guard and skip evidence, grouped staging/deletion,
  recursive List/Assembly/Package ordering and immutable digests, BOM evidence,
  all four ECN states, frozen affected prices, Keep Price Same output, unified
  correction evidence, and blocked product reversal candidates.
- The web gate passed 150 tests. Workspace typecheck, lint, and diff checking
  passed; lint retains only the four documented pre-existing dashboard
  warnings.
- The Next.js 16.2.6 production build passed and compiled the expanded
  revision and correction workbenches. The existing PO file-route Turbopack NFT
  trace warning remains non-blocking.

## 27. LM-08 completion checkpoint — 2026-07-22

LM-08 is complete on `feat/logic-migration`.

Delivered behavior:

- Drawing History now exposes revision number/date, drawing number, remarks,
  and Buffoli, conventional, and CNC laminated quantities through an
  organization-scoped maintenance register and exact XLSX output. The
  revision-0 PI side effect writes the same normalized contract.
- Website Product maintenance normalizes the complete recovered source field
  set, allocates category/subcategory part codes under a PostgreSQL advisory
  lock, derives product description, material construction, thread standard,
  six assembly slots and final assembly codes, and calculates In Progress or
  Completed from the source required-field set. Its XLSX retains the exact 41
  source columns, including the source `additiolNotes` spelling, while omitting
  the displayed calculated status.
- The commercial dashboard now reports all eight source counts and the five
  recovered datasets: six-month enquiry trend, workflow load, quote mix,
  material lead time, and customer Pareto. One repeatable-read PostgreSQL
  snapshot bounds every dataset to the same organization and instant.
- The Section 9 screen/output inventory is fully represented under
  `/commercial`; Sales history and its three exports were delivered in LM-03.
  HR remains an explicitly accounted external proxy dependency because its
  repository and data were not supplied.

Acceptance evidence:

- The serial real-PostgreSQL gate passed 67 tests, including Drawing History
  laminated quantities, source part-code/thread/BOM/status derivation, and all
  dashboard datasets. The web gate passed 152 tests, including exact Drawing
  History and 41-column Website Product workbook metadata.
- The immutable 2026-07-18 Pricing archive contains zero `drawing_history` and
  zero `website_product_entries` rows, so both LM-08 target datasets reconcile
  zero-to-zero without inventing canonical rows. Existing master and workflow
  source mappings remain untouched.
- Database, web, and workspace typechecks passed. Workspace lint passed with
  only the four documented pre-existing dashboard warnings; diff checking and
  the Next.js 16.2.6 production build passed. The existing PO file-route
  Turbopack NFT trace warning remains non-blocking.
- The installed `agent-browser` skill still cannot execute because its CLI is
  absent from PATH. LM-09 therefore owns the final browser, accessibility, and
  responsive acceptance gate.

## 28. LM-09 completion checkpoint — 2026-07-22

LM-09 is complete on `feat/logic-migration`. The Pricing business-logic
migration defined by this specification is delivered. The sealed source remains
read-only until the separately approved retention period expires.

Delivered acceptance behavior:

- The runtime file package now provides guarded `pnpm files:backup` and
  `pnpm files:restore` commands. They reject nested destinations, symlinks,
  unsafe manifest paths, unexpected files, size/checksum drift, and nonempty
  restore roots, and verify every copied and restored byte against a manifest.
- The source-retirement exception register classifies every known Pricing
  archive warning under the approved LM-00 behavior and scope decisions. The
  three orphan import-review relationships remain visible evidence; no source
  anomaly was silently repaired. Physical destruction still requires the
  separate retention approval.
- Live browser acceptance found and fixed two final defects: every Design
  dossier control now has an accessible name, and the ECN register query groups
  `item_type` correctly on an empty organization. The latter is protected by a
  real-PostgreSQL regression.
- Runtime dependency accounting confirms SQLite and Convex readers exist only
  in the explicit migration package. The web, database, and runtime packages
  use PostgreSQL and Better Auth; Redis remains fail-open acceleration.

Acceptance evidence:

- The immutable archive ZIP and SQLite checksums remain
  `40e6d256dc1279b343951c3024efb0470663e0cf4d546537318c888b25bd190b`
  and `cda45d16fcd50908b94b84e2958c30cd32c33e28c5f0b0ea80d78f414fc43cb3`.
  All 45 executable source tests passed, and the isolated virtual-environment
  audit ran all 57 workflow checks with zero findings.
- With Redis stopped, all 67 then-current database tests and all 152 web tests
  passed. A fresh Better Auth session then created a customer and enquiry,
  added a line, handed it to Technical Review, marked it feasible, and observed
  it in Design while Redis remained unavailable. Anonymous `/commercial`
  returned a 307 redirect to sign-in.
- Agent-browser accessibility snapshots verified the corrected Design labels.
  All 17 commercial destinations returned HTTP 200 in the authenticated sweep;
  the high-risk post-fix routes produced zero browser errors, and every route
  checked at 390px reported no document overflow.
- The attachment command rehearsal restored two nested files totaling 8,512
  bytes with identical paths, sizes, checksums, count, and total. Automated
  tests also covered binary bytes and every refusal gate.
- The final serial target gate passed 68 database, eight migration, six
  runtime, and 152 web tests. Workspace typecheck, formatting, lint, diff/JSON
  checks, and the Next.js 16.2.6 production build passed. Lint retains only the
  four documented pre-existing dashboard warnings, and the existing PO
  file-route Turbopack trace warning remains non-blocking.

## 29. Customer Bulk Revision workflow surface — 2026-08-21

The Customer Parameter Bulk Revision source module is available at
`/commercial/customer-bulk-revision`. It retains the six customer field
allowlist, whole-percentage Profit input, active Sent/Accepted price scope,
multi-price staged groups, stored recalculation previews, stage deletion, and
completion-once recursive immutable replacement behavior from LM-07.

The MRM surface uses a 200-row customer revision queue with exact coverage,
50-result server-backed Customer search, and 200-result server-backed active
price search. Only the selected revision loads its complete staged groups; the
active-price candidate table stays server rendered and uses content visibility
for offscreen rows. Migration `0082` adds the open customer-revision queue
index without changing canonical revision state.

## 30. Product Bulk Revision workflow surface — 2026-08-21

The Product Parameter Bulk Revision source module is available at
`/commercial/product-bulk-revision`. It retains the 15-field product allowlist,
process-eligibility guards, active Sent/Accepted cross-customer price scope,
grouped previews, and the source workflow's two-stage completion contract.

Product completion updates Product Master, freezes the product stages, expands
the selected Product identities across every active customer price, and moves
the request to `Pending Customer Costing` without creating Quote revisions.
Customer Bulk Revision then permits the six customer fields and creates the
recursive immutable Quote replacements only on its own completion.

The MRM surface uses a 200-row queue and 200-result server-backed price search.
Candidate and queue tables stay server rendered with content visibility for
offscreen rows. Product identity expansion and Package / Assembly ancestor
discovery use set-based PostgreSQL queries; migration `0083` adds the partial
active-price Product scope index.

## 31. Pricing workflow surface — 2026-08-21

The source Pricing spreadsheet is available at `/commercial/pricing`. It keeps
the exact `Pricing View` workbook columns, immutable Product and calculation
snapshots, recursive Package / Assembly rows through depth ten, parent and BOM
quantity identity, percentage display conversion, currency placement, and
purchased-product Website size and MRMPL description.

The operational register is bounded to 200 root Quotes after server-side
customer, Customer Part Code, Quote Number, Customer UID, and Product UID search.
Every recursive child row for a returned root remains complete. Client Excel
filters persist in the browser and offscreen rows use content visibility.
Migration `0084` adds the active/editable root scope and Customer search indexes.

Customer Part Code drill-down executes as a customer-and-code-scoped PostgreSQL
history query rather than loading every historical Quote into the page. Current
and revision exports remain exhaustive, use stable 500-root keyset batches in
one repeatable-read transaction, and apply the same server scope before reading
recursive snapshot rows.
