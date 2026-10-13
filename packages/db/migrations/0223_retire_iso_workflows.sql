BEGIN;

-- Retire grants with the removed screens/actions. Foreign keys cascade only to
-- their role grants and overrides; retained document-control grants keep IDs.
DELETE FROM identity.permissions
WHERE split_part(key, '.', 1) = 'iso'
  AND (split_part(key, '.', 2) IN (
    'tasks', 'analysis', 'management_review', 'interested_parties', 'sipoc', 'satisfaction'
  ) OR key = 'iso.documents.monitor');

UPDATE identity.permissions
SET module = 'branding'
WHERE key IN ('iso.documents.manage', 'iso.documents.approve', 'iso.documents.release');

-- Existing business records, uploaded artifacts and audit history are retained.
COMMIT;
