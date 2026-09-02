BEGIN;

GRANT USAGE, SELECT ON SEQUENCE maintenance.requests_request_number_seq
  TO mrmpl_web;

COMMIT;
