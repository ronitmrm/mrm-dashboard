# Golden UI patterns

> Every screen should feel like part of the same operational system.

This is the mandatory UI contract for `apps/web`. Start at the canonical primitives below; do not copy their markup into feature folders.

## Canonical primitives

| Need | Primitive | Source |
| --- | --- | --- |
| Operational records | `OperationalTable` | `packages/ui/src/components/table.tsx` |
| KPI or single measure | `MetricCard` | `packages/ui/src/components/card.tsx` |
| Grouped content | `SectionCard` | `packages/ui/src/components/card.tsx` |
| Status label | `StatusBadge` | `packages/ui/src/components/badge.tsx` |
| Page identity | `PageHeader` | `apps/web/components/ui/golden-patterns.tsx` |
| Page actions | `ActionToolbar` | `apps/web/components/ui/golden-patterns.tsx` |
| Form grouping | `FormSection`, `FormGrid` | `apps/web/components/ui/golden-patterns.tsx` |
| Empty/loading/error | `StandardState` | `packages/ui/src/components/standard-state.tsx` |
| Simple overlay | `StandardDialogContent`, `StandardDrawerContent` | `apps/web/components/ui/golden-patterns.tsx` |

The authenticated living reference is `/ui-reference`. Check it in light and dark themes and at desktop and narrow widths.

## Selection rules

Use `OperationalTable` for comparable records, scanning, filtering, sorting, selection, totals, or spreadsheet-like work. Use `MetricCard` only for one prominent measure with optional comparison, status, icon, or compact chart. Use `SectionCard` for related controls, narrative content, forms, or a table shell. Never use cards as decorative wrappers around every element.

Use `PageHeader` once per dashboard screen. Put primary and secondary page actions in its `actions` slot or an adjacent `ActionToolbar`. Use `FormSection` to group related fields and `FormGrid` for responsive field layout.

Use `MetricSummary` from `apps/web/components/ui/golden-patterns.tsx` for a
full-width, responsive row of register counts. It composes `MetricCard`, formats
numbers consistently, and requires a visible scope label. Use existing authorized
page data; do not add global reads just to populate cards. Distinguish loaded,
paginated, search-matching and table-filtered records. Count distinct entities
where rows repeat (orders versus order lines, employees versus posts, checklists
versus steps). Do not sum quantities with different units or money in different
currencies. One useful card is enough for a simple master. Forms, navigation-only
screens and individual record dossiers need no artificial totals. Preserve
existing dashboard cards; do not duplicate them.

## Operational tables

`OperationalTable` owns the shared density, sticky header, scrolling boundary, Excel-style column filters, faceted options, natural sorting, clear-all control, filtered bulk selection, selected-row treatment, and empty/loading/error presentation.

Filters persist in browser storage. Pass a descriptive `filterStorageKey` for important or conditionally mounted tables. Otherwise the table derives a page-scoped key. Keep `filterMode="external"` only when a feature's shared table adapter owns filtering and persistence.

Express cell meaning with semantic state data and `StatusBadge`; do not hard-code palette utility classes. Totals belong in `TableFooter`. Put inputs inside cells only for genuine spreadsheet workflows.

## Semantic tones

The only state tones are:

- `neutral`
- `information`
- `positive`
- `warning`
- `danger`
- `inactive`
- `brand`
- `accent`

Use these names through typed component props. `StatusBadge` accepts an explicit `tone` or infers the approved tone from its `value`. The shared CSS tokens define light and dark appearances. Red/danger is reserved for destructive actions, errors, overdue work, or critical conditions. Green/positive means success or healthy state. Yellow/warning means attention. Blue/information is informational. Grey/inactive means disabled, archived, or unavailable. Brand and accent are structural emphasis, not business status.

Never introduce raw red, amber, emerald, sky, or slate classes for application state. Add or revise a semantic token centrally when a new meaning is truly required.

## States and accessibility

Use `StandardState` for empty, loading, and error states. Give recovery actions to error states when available. Loading content announces with `role="status"`; errors use `role="alert"`.

Preserve keyboard operation, visible focus, labelled controls, sufficient contrast, and touch-friendly controls. Tables remain horizontally scrollable at narrow widths. Dialogs and drawers require a title and use the standard content wrappers when the workflow is simple.

## Approved exceptions

Low-level `Card` and native `table` are allowed only inside the canonical shared implementations. Complex multi-step workflow overlays may use the underlying dialog or sheet primitives when the standard wrapper cannot express their structure. Unique charts and operational visualizations may use bespoke layout, but their surrounding status, card, header, and state semantics remain canonical. Compact embedded identity bars are not page headers.

Record a new exception in this document before merging it. Prefer extending an existing primitive over adding an exception.

Access Administration uses the existing shell title for page identity. At the
user's request, omit its duplicate body banner and use a full-width summary-card
row above the workspace tabs.

## Enforcement and extension

ESLint rejects feature imports/usages of raw `Table`, raw `Card`, native `table`, and `DashboardPageHeader`. `apps/web/lib/ui-conformity.test.ts` scans source and validates the living reference route.

When a primitive is insufficient:

1. Confirm the need is repeated or represents a distinct operational meaning.
2. Extend the narrowest existing primitive with typed props and semantic tokens.
3. Add a focused behavior or conformance test.
4. Demonstrate the state on `/ui-reference`.
5. Update this guide.

Before handoff, run `pnpm lint`, `pnpm typecheck`, `pnpm --filter web test`, and `pnpm build`; smoke-test `/ui-reference` with `pnpm dev:managed`.
