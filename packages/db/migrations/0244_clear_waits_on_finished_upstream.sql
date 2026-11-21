-- Releasing a machine recorded a "waiting for upstream WIP" hold even when the
-- upstream setup was already Item Complete. That WIP can never grow, so the
-- setup was skipped by planning and blocked on the shop floor indefinitely
-- (e.g. P0556 and P2384 Setup 2). Release no longer records such a hold; clear
-- the ones recorded after their upstream setup had finished. Holds recorded
-- before upstream completion stay for the Material flow review.
WITH held AS (
  SELECT state.id,
    (state.source_payload->>'releasedAt')::timestamptz AS released_at,
    (SELECT previous.id FROM manufacturing.operation_setups previous
     WHERE previous.route_option_id = setup.route_option_id AND previous.active
       AND previous.sequence < setup.sequence
     ORDER BY previous.sequence DESC LIMIT 1) AS upstream_setup_id,
    state.work_order_id
  FROM manufacturing.shop_floor_setup_state state
  JOIN manufacturing.operation_setups setup ON setup.id = state.operation_setup_id
  WHERE state.stage = 'planned' AND NOT state.active
    AND state.source_payload #>> '{awaitingMaterial,kind}' = 'wip'
    AND state.source_payload->>'releasedAt' ~ '^\d{4}-\d{2}-\d{2}T'
), finished AS (
  SELECT held.id, held.released_at,
    bool_and(upstream.stage = 'item_complete' AND NOT upstream.active) AS complete,
    max(COALESCE(upstream.completed_at, upstream.updated_at)) AS completed_at
  FROM held
  JOIN manufacturing.shop_floor_setup_state upstream
    ON upstream.work_order_id = held.work_order_id
   AND upstream.operation_setup_id = held.upstream_setup_id
  GROUP BY held.id, held.released_at
)
UPDATE manufacturing.shop_floor_setup_state state
SET source_payload = state.source_payload - 'awaitingMaterial',
    updated_at = now(),
    row_version = state.row_version + 1
FROM finished
WHERE state.id = finished.id
  AND finished.complete
  AND finished.completed_at <= finished.released_at;
