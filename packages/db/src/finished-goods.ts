import type { Pool } from "pg"

/**
 * Lateral joins exposing `current_route.id` and `final_setup` (id, setup_number)
 * for `workOrder` on `floorCode`. The route is the latest non-reversed route
 * change, else the latest non-reversed route selection (either must be on the
 * floor), else the part's only active route there (never for revision job
 * cards). The final setup is its last active setup by sequence, then number.
 */
export function finalSetupJoinSql(workOrder: string, floorCode: string) {
  const routes = `
    FROM manufacturing.route_options route
    JOIN manufacturing.production_floors route_floor
      ON route_floor.id = route.production_floor_id
    WHERE route.organization_id = ${workOrder}.organization_id
      AND route.item_id = ${workOrder}.item_id
      AND route_floor.code = ${floorCode}
      AND (route.work_order_id IS NULL OR route.work_order_id = ${workOrder}.id)`
  return `
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        (SELECT route.id ${routes}
          AND route.id = COALESCE(
            (SELECT route_change.to_route_option_id
             FROM manufacturing.route_change_events route_change
             WHERE route_change.work_order_id = ${workOrder}.id
               AND route_change.reversed_at IS NULL
             ORDER BY route_change.occurred_at DESC, route_change.id DESC LIMIT 1),
            (SELECT route_selection.route_option_id
             FROM manufacturing.route_selections route_selection
             WHERE route_selection.work_order_id = ${workOrder}.id
               AND route_selection.reversed_at IS NULL
             ORDER BY route_selection.selected_at DESC LIMIT 1))),
        (SELECT (array_agg(route.id))[1] ${routes}
          AND route.active
          AND COALESCE(${workOrder}.source_payload->>'isRevision', 'false') <> 'true'
         HAVING count(*) = 1)
      ) AS id
    ) current_route ON true
    LEFT JOIN LATERAL (
      SELECT setup.id, setup.setup_number
      FROM manufacturing.operation_setups setup
      WHERE setup.route_option_id = current_route.id AND setup.active
      ORDER BY setup.sequence DESC, setup.setup_number DESC LIMIT 1
    ) final_setup ON true`
}

export type FinishedGoodsRow = {
  jobCardNumber: string
  partCode: string
  description: string | null
  productionFloorCode: string
  finalSetupNumber: number
  orderedQuantity: number
  dispatchedPieces: number
  productionDate: string
  shift: string
  goodPieces: number
  rejectedPieces: number
}

/**
 * Final-setup output (closed, non-reversed sessions plus legacy entries
 * without a session) per job card, unit, date and shift, over all dates, for
 * job cards with any output between `from` and `to`.
 */
export async function readFinishedGoods(
  executor: Pick<Pool, "query">,
  input: {
    organizationId: string
    productionFloorCodes: readonly string[]
    from: string
    to: string
  }
) {
  const { rows } = await executor.query<FinishedGoodsRow>(
    `WITH output AS (
       SELECT session.work_order_id, floor.code AS floor_code,
         session.operation_setup_id, session.production_date, session.shift,
         session.quantity_good, session.quantity_rejected
       FROM manufacturing.production_sessions session
       JOIN catalog.machines machine ON machine.id = session.machine_id
       JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
       WHERE session.organization_id = $1 AND session.status = 'closed'
         AND session.reversed_at IS NULL AND floor.code = ANY($2::text[])
       UNION ALL
       SELECT entry.work_order_id, COALESCE(route_floor.code, machine_floor.code),
         entry.operation_setup_id, entry.production_date, COALESCE(entry.shift, ''),
         entry.quantity_good, entry.quantity_rejected
       FROM manufacturing.production_entries entry
       LEFT JOIN manufacturing.production_sessions session
         ON session.production_entry_id = entry.id AND session.reversed_at IS NULL
       LEFT JOIN manufacturing.route_options route ON route.id = entry.route_option_id
       LEFT JOIN manufacturing.production_floors route_floor
         ON route_floor.id = route.production_floor_id
       LEFT JOIN catalog.machines machine ON machine.id = entry.machine_id
       LEFT JOIN manufacturing.production_floors machine_floor
         ON machine_floor.id = machine.production_floor_id
       WHERE entry.organization_id = $1 AND entry.reversed_at IS NULL
         AND session.id IS NULL
         AND COALESCE(route_floor.code, machine_floor.code) = ANY($2::text[])
     ), job_cards AS (
       SELECT DISTINCT work_order_id, floor_code FROM output
       WHERE production_date BETWEEN $3::date AND $4::date
     ), final_setups AS (
       SELECT job_cards.work_order_id, job_cards.floor_code,
         final_setup.id AS setup_id, final_setup.setup_number
       FROM job_cards
       JOIN manufacturing.work_orders work_order ON work_order.id = job_cards.work_order_id
       ${finalSetupJoinSql("work_order", "job_cards.floor_code")}
       WHERE final_setup.id IS NOT NULL
     )
     SELECT work_order.job_card_number AS "jobCardNumber", item.uid AS "partCode",
       item.description, final_setups.floor_code AS "productionFloorCode",
       final_setups.setup_number AS "finalSetupNumber",
       COALESCE(work_order.ordered_quantity, 0)::float8 AS "orderedQuantity",
       COALESCE(dispatch.pieces, 0)::float8 AS "dispatchedPieces",
       output.production_date::text AS "productionDate", output.shift,
       sum(output.quantity_good)::float8 AS "goodPieces",
       sum(output.quantity_rejected)::float8 AS "rejectedPieces"
     FROM final_setups
     JOIN output ON output.work_order_id = final_setups.work_order_id
       AND output.floor_code = final_setups.floor_code
       AND output.operation_setup_id = final_setups.setup_id
     JOIN manufacturing.work_orders work_order ON work_order.id = final_setups.work_order_id
     JOIN catalog.items item ON item.id = work_order.item_id
     LEFT JOIN LATERAL (
       SELECT sum(quantity) AS pieces
       FROM manufacturing.dispatch_approval_events
       WHERE work_order_id = work_order.id AND decision = 'approved'
         AND reversed_at IS NULL
     ) dispatch ON true
     GROUP BY work_order.id, item.id, final_setups.floor_code,
       final_setups.setup_number, dispatch.pieces, output.production_date, output.shift
     ORDER BY output.production_date, work_order.job_card_number`,
    [input.organizationId, input.productionFloorCodes, input.from, input.to]
  )
  return rows
}
