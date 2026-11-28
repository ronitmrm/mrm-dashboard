-- Finished replacement history (Joined/Cancelled) blocked deleting an empty
-- approved post. Keep the history row (it holds its own outgoing snapshot)
-- and just unlink it from the deleted post, like employee_post_assignments.
-- Pending replacements still block: the post keeps its outgoing employee.
ALTER TABLE recruitment.post_replacements
  ALTER COLUMN post_id DROP NOT NULL,
  DROP CONSTRAINT post_replacements_post_id_fkey,
  ADD CONSTRAINT post_replacements_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES recruitment.posts(id) ON DELETE SET NULL;
