-- Email signatures saved from Branding > Signature. Every saved signature is
-- listed for people who can open the Signature page.
CREATE TABLE core.email_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  designation text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  linkedin text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  image_host text NOT NULL DEFAULT '',
  mail_app text NOT NULL DEFAULT 'outlook',
  created_by uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO identity.permissions (key, module, name, description) VALUES
  ('brand-kit.signature.write', 'brand-kit', 'Save Signature',
    'Save, update and delete email signatures.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM identity.roles role
JOIN identity.permissions permission ON permission.key = 'brand-kit.signature.write'
WHERE role.key = 'administrator'
ON CONFLICT DO NOTHING;
