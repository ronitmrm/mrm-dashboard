-- Preserve the originating salesperson on legacy enquiries created before
-- manual enquiry logging populated created_by_user_id.
WITH creators AS (
  SELECT DISTINCT ON (event.target_id)
    event.target_id, event.actor_user_id
  FROM audit.events event
  WHERE event.target_schema = 'sales'
    AND event.target_table = 'enquiries'
    AND event.event_type = 'enquiry.created'
    AND event.actor_user_id IS NOT NULL
  ORDER BY event.target_id, event.occurred_at, event.id
)
UPDATE sales.enquiries enquiry
SET created_by_user_id = creator.actor_user_id,
    updated_by_user_id = COALESCE(
      enquiry.updated_by_user_id,
      creator.actor_user_id
    )
FROM creators creator
WHERE enquiry.created_by_user_id IS NULL
  AND creator.target_id = enquiry.id;

CREATE INDEX enquiries_originating_salesperson_idx
  ON sales.enquiries (
    organization_id,
    created_by_user_id,
    created_at DESC,
    id DESC
  );
