CREATE TABLE catalog.printed_drawing_holdings (
  drawing_revision_id uuid NOT NULL REFERENCES catalog.drawing_revisions(id),
  production_floor_code text NOT NULL CHECK (
    production_floor_code IN ('conventional', 'conventional-02', 'cnc', 'forging')
  ),
  quantity integer NOT NULL CHECK (quantity >= 0),
  location text NOT NULL DEFAULT '' CHECK (length(location) <= 200),
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (drawing_revision_id, production_floor_code),
  CHECK (quantity = 0 OR length(trim(location)) > 0)
);

GRANT SELECT, INSERT, UPDATE ON catalog.printed_drawing_holdings TO mrmpl_web;
GRANT SELECT ON catalog.printed_drawing_holdings TO mrmpl_worker, mrmpl_reporting;
