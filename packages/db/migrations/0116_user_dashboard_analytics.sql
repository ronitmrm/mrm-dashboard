ALTER TABLE identity.users
  ADD COLUMN dashboard_analytics jsonb;

ALTER TABLE identity.users
  ADD CONSTRAINT users_dashboard_analytics_object
  CHECK (dashboard_analytics IS NULL OR jsonb_typeof(dashboard_analytics) = 'object');

COMMENT ON COLUMN identity.users.dashboard_analytics IS
  'Versioned, permission-filtered configuration for personal KPI, chart, and calculated dashboard widgets.';
