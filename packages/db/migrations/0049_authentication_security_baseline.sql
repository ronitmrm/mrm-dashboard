CREATE TABLE IF NOT EXISTS identity.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  count integer NOT NULL,
  last_request bigint NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.rate_limits TO mrmpl_web;
