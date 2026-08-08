# Commercial bounded-read contract

Date: 2026-08-08  
Scope: commercial operational reads, selectors, related records, exports, and history

## Repository result boundary

Every bounded repository method returns the following shape; pages do not infer truncation by slicing an ordinary array:

```ts
type BoundedCommercialResult<Row> = {
  rows: Row[]
  coverage: {
    returned: number
    limit: number
    truncated: boolean
    total?: number
  }
}
```

The repository requests `limit + 1`, returns at most `limit`, and sets `truncated` from the sentinel unless the query already produces an exact `total`. Filters and search execute before the bound. Related-record statements receive only the returned root IDs and must return every related row for those roots.

Every bounded query has a business order followed by an immutable unique tie-breaker. PostgreSQL does not promise a stable limited subset without a unique `ORDER BY`; the contract follows the [PostgreSQL LIMIT guidance](https://www.postgresql.org/docs/current/queries-limit.html).

## Collection classes and caps

| Collection class                                                                                                                                                                                                                                                                 |                      Bound | Coverage and navigation                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Enquiries, Technical review, Design, Costing, Pricing register, Quotes, Purchase Orders, Sales clarification, Sales handover, quote-ready, follow-ups, correction candidates, pricing corrections, bulk revisions, ECNs, editable masters, and website-product operational views |                  200 roots | Section-specific notice when truncated; configured filters/search run before the cap. A notice names the section and points to search, complete history, or export.            |
| Sent-quote operational summary                                                                                                                                                                                                                                                   |               50 enquiries | Preserve “latest sent” semantics and show a sent-quotes-specific notice. The complete sent-quote export remains exhaustive.                                                    |
| Sales match choices                                                                                                                                                                                                                                                              | 50 quotes per enquiry item | Preserve exact customer-part-code matches first, then sent/updated recency, then quote ID. Return coverage per enquiry item and offer repository-backed search when truncated. |
| Customer page                                                                                                                                                                                                                                                                    |               15 customers | Preserve page-number navigation and exact total. Apply `LIMIT`/`OFFSET` in the repository; never load all customers and slice in the page.                                     |
| Product page                                                                                                                                                                                                                                                                     |                25 products | Preserve page-number navigation and exact total through the existing repository query.                                                                                         |
| Customer and product selectors                                                                                                                                                                                                                                                   |                 50 matches | Search on demand; do not load the complete master merely to populate a select. Exact UID/code matches rank first.                                                              |
| Attachments, design BOM rows, quote components, and other children of returned operational roots                                                                                                                                                                                 |         No independent cap | Batch by returned root IDs and return all children for those roots. Their parent's coverage notice governs root coverage.                                                      |
| One selected enquiry, quote, Purchase Order, revision, ECN, or drawing-history root                                                                                                                                                                                              |                   Complete | Entity detail and explicit history are never silently truncated. Large histories use navigable keyset pages.                                                                   |

The 200-row default is a response-size ceiling, not a license to change queue membership or order. Existing business rank remains authoritative: for example, Design keeps changes-required and clarification work ahead of pending work; follow-ups remain due-date ordered; enquiries remain newest-first. Add a stable ID tie-breaker without replacing that rank.

## Search contract

Search input is trimmed and case-folded. Blank input disables search. Exact business identifiers rank first. Contains search requires at least three visible characters, escapes SQL wildcard characters, and matches only the fields named for that repository:

- items/selectors: product UID and description;
- drawings: drawing number and remarks;
- website products: part code, description, category, sub-category, and grade;
- sales match choices: customer part code, quote number, product UID, and description.

Category, status, organization, and active/inactive filters are exact predicates and execute before text ranking and the cap. Results retain their collection's business order within equal search rank. No page performs client-side search over an already truncated result.

Contains predicates must match the expressions indexed by migration `0043`. PostgreSQL's `pg_trgm` GIN/GiST operator classes support indexed `LIKE`/`ILIKE`, while patterns with no extractable trigram can degrade to a full-index scan; this is why descriptive contains search requires three characters. See the [PostgreSQL pg_trgm documentation](https://www.postgresql.org/docs/current/pgtrgm.html).

## Sales candidate correctness

The batch candidate query is one statement for all returned Sales clarification roots. Its lateral subquery may fetch 51 ranked candidates per root to detect a 50-row cap, but the outer query must preserve `(requested item, match rank, sent_at, updated_at, quote ID)` ordering. Reordering the final rows by UUID is forbidden.

When a candidate set is truncated, the decision control shows that only the first 50 ranked matches are loaded and exposes server-side search. Selecting “new item,” “commercial requote,” or “technical revision” retains the existing validation and write behavior; a bound may never remove the ability to choose an eligible older quote.

## Exhaustive paths

The following are completeness surfaces, not operational snapshots:

- enquiry-register and enquiry-line exports;
- Sales history, follow-up history, and sent-quote exports;
- Purchase Order reports and artifacts;
- Pricing, master, drawing, and website-product exports where offered;
- selected quote/revision lineage and selected ECN affected-price history;
- audit/history views explicitly labelled as history.

Repositories read these paths to completion with stable keyset batches of at most 500 rows inside one consistent database snapshot. The 200/50 operational caps are not accepted parameters on an export/history method. A navigable history page may render 200 rows at a time, but every row remains reachable and its total/next cursor is explicit.

## Shared ECN graph

All preview and decision paths for one ECN use the same bounded-statement graph loader:

1. load the selected ECN and exhaustive root quote IDs;
2. load the recursive quote/snapshot graph;
3. load all components for graph quote IDs;
4. load all referenced products;
5. load existing decisions and prices;
6. reserve one statement for path-specific evidence if required.

The graph is exhaustive for those roots and is bounded by the selected business aggregate rather than an arbitrary row cap. Recursive per-node `getQuote`/`getComponents` calls are forbidden. Cycles and the existing depth-20 validation remain errors. The complete path stays within Ticket 3's six-statement ECN budget.

## Acceptance

Tests use real PostgreSQL and datasets at 0, 1, the exact cap, cap + 1, and multiple pages. They prove:

- repository bounds, unique ordering, and coverage metadata;
- search/filter-before-limit and indexed execution plans without temporary writes;
- Sales ranking is identical between single-item and batched candidate reads;
- related children are complete for every returned root and statements remain within six for Enquiries, five for Design, six for Sales, and six for ECN;
- Customer page size 15 and Product page size 25 retain navigation and exact totals;
- operational notices identify the truncated section and do not claim “newest” for due-date or priority-ranked queues;
- exports/history include records older than every operational cap and remain complete across batch boundaries.

Bounded-notice rendering and server-backed selector/search behavior require manual UI acceptance at the implementation gate. Query, ordering, coverage, and export completeness are automated.

## Current implementation blockers

- `CustomersPage` loads every organization customer and slices to 15 in application memory; pagination is not yet at the repository boundary.
- `EnquiriesPage` loads every customer for its selector and receives a plain 200-row enquiry array with no coverage result or notice.
- `DesignPage` loads an unbounded queue and complete portfolio product list. Attachments are batched correctly, but root coverage is absent.
- `SalesPage` exposes coverage only for enquiries and follow-ups. Other queues are unbounded or silently fixed at 50, and the generic “newest” notice is false for due-date-ordered follow-ups.
- `listSalesMatchCandidatesForItems` limits each root to 50 inside the ranked lateral query, then orders the outer result by quote UUID; this discards the required relevance/recency presentation order and exposes no per-root coverage.
- The Sales and enquiry-register pages link to complete export URLs that have no corresponding route in the current tree; completeness cannot be accepted until those routes exist and pass cap + 1 tests.
- Migration `0043` indexes item, drawing, and website-profile contains search, but not quote-number/customer-part-code candidate search. Its predicates/indexes must be reconciled before that unpublished migration reaches staging.
- `applyEngineeringChangeDecision` still traverses quotes/components recursively per node instead of using the shared graph loader already used by the affected-price read.
