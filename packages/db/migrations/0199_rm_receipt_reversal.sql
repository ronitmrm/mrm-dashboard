-- Mistaken RM inward entries leave an audit trail but no longer contribute to
-- active receipt totals or the dashboard source projection.
ALTER TABLE manufacturing.raw_material_receipts
  ADD COLUMN reversed_at timestamptz,
  ADD COLUMN reversed_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN reversal_reason text;

INSERT INTO identity.permissions (key, module, name, description)
SELECT format('entries.%s.rm_inward.delete', floor.code), 'entries',
  format('%s / RM Inward / delete', floor.name),
  'Reverse one mistaken RM inward receipt in this Production Unit.'
FROM (VALUES
  ('conventional', 'Conventional-01'),
  ('conventional-02', 'Conventional-02'),
  ('cnc', 'CNC-01'),
  ('forging', 'Forging')
) AS floor(code, name);

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
JOIN identity.permissions permission
  ON permission.key IN (
    'entries.conventional.rm_inward.delete',
    'entries.conventional-02.rm_inward.delete',
    'entries.cnc.rm_inward.delete',
    'entries.forging.rm_inward.delete'
  )
WHERE role.key = 'administrator'
ON CONFLICT (role_id, permission_id) DO NOTHING;
