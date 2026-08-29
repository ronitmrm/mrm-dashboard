-- Customer Costing replaces the component rows belonging to a mutable quote
-- snapshot. Keep this narrowly scoped instead of granting broad DELETE access.
GRANT DELETE ON
  sales.quote_package_components
TO mrmpl_web;
