ALTER TABLE identity.users
  ADD COLUMN dashboard_widgets text[];

COMMENT ON COLUMN identity.users.dashboard_widgets IS
  'Ordered personal home-dashboard widget IDs; NULL uses role-aware defaults and an empty array is intentional.';
