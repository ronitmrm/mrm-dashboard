-- Device approval and screen protection.
--
-- Device approval: every browser carries a random device cookie. Staff without
-- "Use Any Device" may sign in only on devices an administrator approved.
-- Enforcement starts off so devices register while staff work normally.
--
-- Screen protection: staff without each screen right get a watermark, hidden
-- content while the window is unfocused, and blocked printing respectively.
CREATE TABLE identity.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SHA-256 of the device cookie; null until a seeded device is first seen.
  token_hash text UNIQUE,
  -- A seeded device is claimed by the next request carrying this session.
  seed_session_id uuid UNIQUE REFERENCES identity.sessions(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'revoked')),
  user_agent text,
  model text,
  platform text,
  platform_version text,
  last_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  -- Refused sign-ins while enforced, so approvers see who is trying.
  blocked_attempts integer NOT NULL DEFAULT 0,
  last_blocked_at timestamptz,
  CHECK (token_hash IS NOT NULL OR seed_session_id IS NOT NULL)
);

CREATE TABLE identity.device_approval_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enforced boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO identity.device_approval_settings DEFAULT VALUES;

-- Seed the approval queue from each user's latest sign-in per browser over the
-- past two days. Older sessions register only when they are next used.
INSERT INTO identity.devices (
  seed_session_id, code, user_agent, last_user_id, first_seen_at, last_seen_at
)
SELECT DISTINCT ON (sessions.user_id, sessions.user_agent)
  sessions.id,
  upper(substr(md5(sessions.id::text), 1, 4) || '-' || substr(md5(sessions.id::text), 5, 4)),
  left(sessions.user_agent, 400),
  sessions.user_id,
  sessions.created_at,
  sessions.updated_at
FROM identity.sessions
WHERE sessions.created_at >= now() - interval '2 days'
  AND sessions.expires_at > now()
  AND sessions.impersonated_by IS NULL
ORDER BY sessions.user_id, sessions.user_agent, sessions.created_at DESC;

INSERT INTO identity.permissions (key, module, name, description) VALUES
  ('administration.devices.manage', 'administration', 'Approve Devices',
   'Approve or revoke devices and switch device approval enforcement.'),
  ('administration.devices.bypass', 'administration', 'Use Any Device',
   'Sign in on any device, including devices not yet approved.'),
  ('administration.screen.no_watermark', 'administration', 'Hide Screen Watermark',
   'Pages show no watermark of the signed-in name, employee ID and time.'),
  ('administration.screen.unfocused_view', 'administration', 'Keep Content Visible When Unfocused',
   'Pages stay visible when the window loses focus, e.g. to a snipping tool.'),
  ('administration.screen.print', 'administration', 'Allow Printing And Print Screen',
   'Pages can be printed and the Print Screen key keeps its capture.')
ON CONFLICT (key) DO NOTHING;

-- The system Administrator holds every new right; other roles are configured
-- in Access Administration. Without the screen rights, protection applies.
INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM identity.roles roles CROSS JOIN identity.permissions permissions
WHERE roles.key = 'administrator' AND roles.is_system
  AND permissions.key IN (
    'administration.devices.manage', 'administration.devices.bypass',
    'administration.screen.no_watermark', 'administration.screen.unfocused_view',
    'administration.screen.print'
  )
ON CONFLICT DO NOTHING;
