-- Pricing users remove mutable staged changes before a revision completes.
-- Keep this narrowly scoped instead of granting broad DELETE access.
GRANT DELETE ON
  sales.bulk_price_revision_changes
TO mrmpl_web;
