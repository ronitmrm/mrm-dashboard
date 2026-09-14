BEGIN;
CREATE TABLE manufacturing.order_acceptance_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  floor_code text NOT NULL,
  reference text NOT NULL,
  revision_of uuid REFERENCES manufacturing.order_acceptance_proposals(id),
  input jsonb NOT NULL,
  result jsonb,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'approved')),
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES identity.users(id),
  updated_by uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  CHECK (state <> 'approved' OR (result IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX order_acceptance_register ON manufacturing.order_acceptance_proposals (organization_id, floor_code, updated_at DESC);
CREATE FUNCTION manufacturing.protect_approved_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'approved' THEN RAISE EXCEPTION 'Approved proposals are immutable. Create a revision.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_acceptance_immutable BEFORE UPDATE OR DELETE ON manufacturing.order_acceptance_proposals
  FOR EACH ROW EXECUTE FUNCTION manufacturing.protect_approved_proposal();
INSERT INTO identity.permissions (key, module, name, description)
SELECT 'operations.floors.' || code || '.planner_actions.order_acceptance.write', 'planning',
  'Manage ' || name || ' Proposed Orders', 'Save, calculate and approve proposals without creating POs or reserving capacity.'
FROM manufacturing.production_floors GROUP BY code, name
ON CONFLICT (key) DO NOTHING;
INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM identity.roles r CROSS JOIN identity.permissions p
WHERE r.key IN ('administrator', 'administrative') AND p.key LIKE 'operations.floors.%.planner_actions.order_acceptance.write'
ON CONFLICT DO NOTHING;
GRANT SELECT, INSERT, UPDATE ON manufacturing.order_acceptance_proposals TO mrmpl_web;
GRANT SELECT ON manufacturing.order_acceptance_proposals TO mrmpl_reporting;
COMMIT;
