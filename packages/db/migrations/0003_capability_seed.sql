INSERT INTO identity.permissions (key, module, name)
VALUES
  ('pricing.dashboard.read', 'pricing', 'View pricing dashboard'),
  ('pricing.masters.read', 'pricing', 'View pricing masters'),
  ('pricing.masters.write', 'pricing', 'Manage pricing masters'),
  ('pricing.sales.read', 'pricing', 'View sales workflow'),
  ('pricing.sales.write', 'pricing', 'Manage sales workflow'),
  ('pricing.enquiries.read', 'pricing', 'View enquiries'),
  ('pricing.enquiries.write', 'pricing', 'Manage enquiries'),
  ('pricing.technical_review.read', 'pricing', 'View technical reviews'),
  ('pricing.technical_review.write', 'pricing', 'Manage technical reviews'),
  ('pricing.design.read', 'pricing', 'View design tasks'),
  ('pricing.design.write', 'pricing', 'Manage design tasks'),
  ('pricing.costing.read', 'pricing', 'View product and quote costing'),
  ('pricing.costing.write', 'pricing', 'Manage product and quote costing'),
  ('pricing.quotes.read', 'pricing', 'View quotes'),
  ('pricing.quotes.write', 'pricing', 'Manage quotes'),
  ('pricing.purchase_orders.read', 'pricing', 'View purchase orders and proforma invoices'),
  ('pricing.purchase_orders.write', 'pricing', 'Manage purchase orders and proforma invoices'),
  ('pricing.revisions.read', 'pricing', 'View price revisions and ECNs'),
  ('pricing.revisions.write', 'pricing', 'Manage price revisions and ECNs'),
  ('pricing.corrections.read', 'pricing', 'View pricing corrections'),
  ('pricing.corrections.write', 'pricing', 'Reverse pricing records'),
  ('operations.dashboard.read', 'operations', 'View operations dashboard'),
  ('operations.production.write', 'operations', 'Record production'),
  ('operations.attendance.write', 'operations', 'Record attendance'),
  ('operations.training.write', 'operations', 'Record training'),
  ('operations.route_selection.write', 'operations', 'Select production routes'),
  ('operations.shop_floor.write', 'operations', 'Manage shop-floor state'),
  ('operations.dispatch.write', 'operations', 'Approve dispatch'),
  ('planning.plan.read', 'planning', 'View production plans'),
  ('planning.priority.write', 'planning', 'Change planner priorities'),
  ('planning.constraint.write', 'planning', 'Manage machine constraints'),
  ('planning.override.write', 'planning', 'Override machine plans'),
  ('planning.route_change.write', 'planning', 'Change planned routes'),
  ('planning.refresh.execute', 'planning', 'Request planning recalculation'),
  ('quality.parameters.manage', 'quality', 'Manage inspection parameter sets'),
  ('quality.first_piece.write', 'quality', 'Record first-piece inspections'),
  ('quality.hourly.write', 'quality', 'Record hourly quality checks'),
  ('quality.setup_checklist.write', 'quality', 'Complete setup checklists'),
  ('maintenance.definitions.manage', 'maintenance', 'Manage maintenance definitions'),
  ('maintenance.schedules.manage', 'maintenance', 'Manage machine maintenance schedules'),
  ('maintenance.tasks.write', 'maintenance', 'Complete maintenance tasks'),
  ('hr.recruitment.read', 'hr', 'View recruitment'),
  ('hr.recruitment.write', 'hr', 'Manage recruitment'),
  ('hr.employees.read', 'hr', 'View employee records'),
  ('hr.employees.write', 'hr', 'Manage employee records'),
  ('administration.users.manage', 'administration', 'Manage users'),
  ('administration.roles.manage', 'administration', 'Manage roles and capabilities'),
  ('administration.migration.review', 'administration', 'Review migration conflicts'),
  ('administration.audit.read', 'administration', 'View audit history')
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.roles (key, name, description, is_system)
VALUES (
  'administrator',
  'Administrator',
  'Full MRMPL operational administration',
  true
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM identity.roles AS roles
CROSS JOIN identity.permissions AS permissions
WHERE roles.key = 'administrator'
ON CONFLICT (role_id, permission_id) DO NOTHING;

