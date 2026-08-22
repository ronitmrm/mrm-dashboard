CREATE TEMP TABLE action_capability_mapping (
  new_key text PRIMARY KEY,
  old_key text NOT NULL
) ON COMMIT DROP;

INSERT INTO action_capability_mapping (new_key, old_key)
VALUES
  ('administration.access.read', 'administration.roles.manage'),
  ('administration.post_access.assign', 'administration.roles.manage'),
  ('administration.staff_roles.assign', 'administration.roles.manage'),
  ('administration.roles.create', 'administration.roles.manage'),
  ('administration.staff.link', 'administration.users.manage'),
  ('administration.permission_overrides.manage', 'administration.roles.manage'),
  ('administration.staff.provision', 'administration.users.manage'),
  ('administration.role_permissions.update', 'administration.roles.manage'),
  ('pricing.assemblies.lines.add', 'pricing.assemblies.write'),
  ('pricing.enquiries.items.add', 'pricing.enquiries.write'),
  ('pricing.purchase_orders.lines.add', 'pricing.purchase_orders.write'),
  ('pricing.ecns.decision.apply', 'pricing.revisions.write'),
  ('pricing.enquiries.import_review.apply', 'pricing.enquiries.write'),
  ('pricing.proforma_invoices.approve', 'pricing.purchase_orders.write'),
  ('pricing.purchase_orders.cancel', 'pricing.purchase_orders.write'),
  ('pricing.price_revisions.complete', 'pricing.revisions.write'),
  ('pricing.ecns.costing.complete', 'pricing.revisions.write'),
  ('pricing.ecns.design.complete', 'pricing.revisions.write'),
  ('pricing.sales.followups.complete', 'pricing.sales.write'),
  ('pricing.sales.clarifications.complete', 'pricing.sales.write'),
  ('pricing.price_revisions.create', 'pricing.revisions.write'),
  ('pricing.customers.create', 'pricing.customers.write'),
  ('pricing.ecns.create', 'pricing.revisions.write'),
  ('pricing.enquiries.create', 'pricing.enquiries.write'),
  ('pricing.purchase_orders.quote_requests.create', 'pricing.purchase_orders.write'),
  ('pricing.purchase_orders.create', 'pricing.purchase_orders.write'),
  ('pricing.purchase_orders.prices.decide', 'pricing.purchase_orders.write'),
  ('pricing.price_revisions.stages.delete', 'pricing.revisions.write'),
  ('pricing.enquiries.delete', 'pricing.enquiries.write'),
  ('pricing.masters.delete', 'pricing.masters.write'),
  ('pricing.proforma_invoices.generate', 'pricing.purchase_orders.write'),
  ('pricing.enquiries.handover', 'pricing.enquiries.write'),
  ('pricing.enquiries.lines.import', 'pricing.enquiries.write'),
  ('pricing.enquiries.register.import', 'pricing.enquiries.write'),
  ('pricing.masters.import', 'pricing.masters.write'),
  ('pricing.purchase_orders.import', 'pricing.purchase_orders.write'),
  ('pricing.proforma_invoices.mark_sent', 'pricing.purchase_orders.write'),
  ('pricing.costing.prepare', 'pricing.costing.write'),
  ('pricing.corrections.record', 'pricing.corrections.write'),
  ('pricing.masters.rename', 'pricing.masters.write'),
  ('pricing.design.clarifications.request', 'pricing.design.write'),
  ('pricing.costing.design_clarifications.request', 'pricing.costing.write'),
  ('pricing.corrections.design_handoff.reverse', 'pricing.corrections.write'),
  ('pricing.corrections.product_entry.reverse', 'pricing.corrections.write'),
  ('pricing.design.save', 'pricing.design.write'),
  ('pricing.quotes.prepare', 'pricing.costing.write'),
  ('pricing.quotes.send', 'pricing.quotes.write'),
  ('pricing.quotes.return_to_costing', 'pricing.costing.write'),
  ('pricing.price_revisions.stages.update', 'pricing.revisions.write'),
  ('pricing.design.start', 'pricing.design.write'),
  ('pricing.customers.update', 'pricing.customers.write'),
  ('pricing.drawing_history.update', 'pricing.drawing_history.write'),
  ('pricing.enquiries.update', 'pricing.enquiries.write'),
  ('pricing.enquiries.items.update', 'pricing.enquiries.write'),
  ('pricing.masters.update', 'pricing.masters.write'),
  ('pricing.costing.update', 'pricing.costing.write'),
  ('pricing.technical_review.update', 'pricing.technical_review.write'),
  ('pricing.website_products.update', 'pricing.website_products.write'),
  ('pricing.purchase_orders.files.upload', 'pricing.purchase_orders.write'),
  ('hr.candidates.assign', 'hr.recruitment.write'),
  ('hr.employees.assign', 'hr.employees.write'),
  ('hr.employees.bulk_assign', 'hr.employees.write'),
  ('hr.candidates.appointments.complete', 'hr.recruitment.write'),
  ('hr.combined_roles.create', 'hr.recruitment.write'),
  ('hr.jobs.create', 'hr.recruitment.write'),
  ('hr.candidates.events.delete', 'hr.recruitment.write'),
  ('hr.approved_posts.delete', 'hr.recruitment.write'),
  ('hr.masters.delete', 'hr.recruitment.write'),
  ('hr.candidates.events.log', 'hr.recruitment.write'),
  ('hr.interviews.record', 'hr.recruitment.write'),
  ('hr.masters.rename', 'hr.recruitment.write'),
  ('hr.candidates.save', 'hr.recruitment.write'),
  ('hr.approved_posts.create', 'hr.recruitment.write'),
  ('hr.masters.create', 'hr.recruitment.write'),
  ('hr.job_templates.save', 'hr.recruitment.write'),
  ('hr.interviews.schedule', 'hr.recruitment.write'),
  ('hr.candidates.events.update', 'hr.recruitment.write'),
  ('hr.combined_roles.update', 'hr.recruitment.write'),
  ('hr.approved_posts.update', 'hr.recruitment.write'),
  ('hr.candidates.applications.withdraw', 'hr.recruitment.write'),
  ('store.requests.submit', 'store.requests.write'),
  ('store.requests.issue', 'store.requests.write'),
  ('store.asset_movement.write', 'store.asset_history.write'),
  ('store.asset_maintenance.write', 'store.asset_history.write'),
  ('store.asset_repair.write', 'store.asset_history.write'),
  ('store.asset_lifecycle.write', 'store.asset_history.write'),
  ('store.masters.write', 'store.masters.write'),
  ('store.purchase_orders.create', 'store.stock.write'),
  ('store.receipts.receive', 'store.purchase_register.write'),
  ('store.new_item_requests.submit', 'store.new_item_requests.write'),
  ('store.new_item_requests.resolve', 'store.new_item_requests.write');

INSERT INTO identity.permissions (key, module, name, description)
SELECT
  new_key,
  split_part(new_key, '.', 1),
  initcap(replace(replace(new_key, '.', ' '), '_', ' ')),
  'Allows this business command independently from page access.'
FROM action_capability_mapping
ON CONFLICT (key) DO NOTHING;


INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role_permissions.role_id, new_permission.id
FROM action_capability_mapping mapping
JOIN identity.permissions old_permission ON old_permission.key = mapping.old_key
JOIN identity.role_permissions
  ON role_permissions.permission_id = old_permission.id
JOIN identity.permissions new_permission ON new_permission.key = mapping.new_key
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO identity.user_permission_overrides (
  user_id,
  permission_id,
  effect,
  reason,
  assigned_by_user_id,
  assigned_at,
  expires_at
)
SELECT
  overrides.user_id,
  new_permission.id,
  overrides.effect,
  overrides.reason,
  overrides.assigned_by_user_id,
  overrides.assigned_at,
  overrides.expires_at
FROM action_capability_mapping mapping
JOIN identity.permissions old_permission ON old_permission.key = mapping.old_key
JOIN identity.user_permission_overrides overrides
  ON overrides.permission_id = old_permission.id
JOIN identity.permissions new_permission ON new_permission.key = mapping.new_key
ON CONFLICT (user_id, permission_id) DO NOTHING;

DROP TABLE action_capability_mapping;