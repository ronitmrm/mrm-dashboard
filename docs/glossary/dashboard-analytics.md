# Personal dashboard analytics

## Personal analytics widget

A user-owned visualization on the main dashboard. Supported widget types are:

- **Metric:** one canonical dashboard metric.
- **Comparison chart:** two to eight canonical dashboard metrics shown as bars.
- **Calculated KPI:** a named calculation over two canonical dashboard metrics.

Widgets preserve their saved order. A user may save at most 24 analytics widgets.
Deleting or reordering a widget affects only that user's dashboard.

## Canonical dashboard metric

A permission-aware, read-only measure exposed by a source module. The metric
catalog owns its stable identifier, display name, semantic tone, unit, and
source dashboard module. A metric is available only when the user can access
its source module. Saved widgets are filtered again on every load and save so
stale or unauthorized metrics cannot be displayed.

## Calculated KPI

A safe structured calculation. It is not executable code and cannot call the
database or arbitrary application functions. Version 1 supports:

- `add`: left value plus right value.
- `subtract`: left value minus right value.
- `percent`: left value divided by right value, multiplied by 100.

Both operands use current canonical metric values. Missing operands produce an
unavailable result. A percentage with a zero divisor is unavailable. Results
are rounded to two decimal places; percentage results display the `%` unit.

## Add to My Dashboard
