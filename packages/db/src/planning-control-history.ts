import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"
import type { ProductionFloorCode } from "./production-floors"
import { shiftSetupAssignmentJoin } from "./shift-setup-assignment"

export type PlanningControlHistoryRow = {
  id: string
  kind: "session" | "material" | "workflow" | "setup" | "rework" | "dispatch" | "machine"
  completedAt: string
  jobCard: string | null
  part: string | null
  machine: string | null
  setup: string | null
  reason: string | null
  note: string | null
  productionDate: string | null
  shift: string | null
  sessionId: string | null
}

const historyShiftEnd = `((paged.production_date + CASE paged.shift
  WHEN 'A' THEN interval '14 hours'
  WHEN 'B' THEN interval '22 hours'
  WHEN 'C' THEN interval '30 hours'
END) AT TIME ZONE 'Asia/Kolkata')`

export function createPlanningControlHistoryRepository(options: RepositoryPoolOptions) {
  const { pool, close } = repositoryPool(options)
  return {
    close,
    async read(organizationId: string, floor: ProductionFloorCode, page: number) {
      const limit = 50
      const { rows } = await pool.query<PlanningControlHistoryRow>(`
        WITH floor_snapshot AS (
          SELECT payload FROM derived.dashboard_floor_read_models
          WHERE organization_id = $1 AND production_floor_code = $2
          ORDER BY publication_version DESC LIMIT 1
        ), completed AS (
          SELECT e.id::text AS id, 'session' AS kind, e.occurred_at AS completed_at,
            COALESCE(s.job_card_number_snapshot, w.job_card_number) AS job_card,
            COALESCE(s.part_code_snapshot, i.uid) AS part,
            COALESCE(NULLIF(s.machine_number_snapshot, ''), m.machine_number) AS machine,
            e.reason, NULL::text AS note, s.production_date AS production_date, s.shift, s.id::text AS session_id,
            COALESCE(NULLIF(s.setup_number_snapshot::text, ''), os.setup_number::text) AS setup_number,
            NULL::uuid AS shift_machine_id
          FROM audit.events e
          JOIN manufacturing.production_sessions s ON s.id = e.target_id AND s.organization_id = e.organization_id
          JOIN catalog.machines m ON m.id = s.machine_id
          JOIN manufacturing.production_floors f ON f.id = m.production_floor_id
          JOIN manufacturing.work_orders w ON w.id = s.work_order_id
          JOIN catalog.items i ON i.id = w.item_id
          LEFT JOIN manufacturing.operation_setups os ON os.id = s.operation_setup_id
          WHERE e.organization_id = $1 AND f.code = $2 AND e.event_type = 'production.session.efficiency_flag_closed'

          UNION ALL
          SELECT e.id::text, 'material', e.occurred_at, w.job_card_number, i.uid,
            NULL, e.reason, NULL, NULL, NULL, NULL, NULL, NULL
          FROM audit.events e
          JOIN manufacturing.work_orders w ON w.id = e.target_id AND w.organization_id = e.organization_id
          JOIN catalog.items i ON i.id = w.item_id
          WHERE e.organization_id = $1 AND e.event_type = 'production.rm_short.accepted'
            AND COALESCE(e.metadata->>'productionFloorCode', w.source_payload->>'productionFloorCode',
              w.source_payload->>'productionFloor', 'conventional') = $2

          UNION ALL
          SELECT e.id::text, 'workflow', e.occurred_at, w.job_card_number, i.uid,
            m.machine_number, e.reason, NULL, NULL, NULL, NULL, os.setup_number::text, NULL
          FROM manufacturing.shop_floor_stage_events e
          JOIN manufacturing.shop_floor_setup_state s ON s.id = e.setup_state_id
          JOIN manufacturing.operation_setups os ON os.id = s.operation_setup_id
          JOIN manufacturing.work_orders w ON w.id = s.work_order_id
          JOIN catalog.items i ON i.id = w.item_id
          JOIN catalog.machines m ON m.id = e.machine_id
          JOIN manufacturing.production_floors f ON f.id = m.production_floor_id
          WHERE e.organization_id = $1 AND f.code = $2 AND e.reversed_at IS NULL
            AND e.to_stage = 'operator_started' AND e.source_system = 'mrm-dashboard'
            AND e.reason = 'Resolved from raw production entry.'

          UNION ALL
          SELECT e.id::text, 'setup', e.occurred_at, w.job_card_number, i.uid,
            m.machine_number, e.reason, NULL, NULL, NULL, NULL, os.setup_number::text, NULL
          FROM audit.events e
          JOIN manufacturing.shop_floor_setup_state s ON s.id = e.target_id AND s.organization_id = e.organization_id
          JOIN manufacturing.operation_setups os ON os.id = s.operation_setup_id
          JOIN manufacturing.work_orders w ON w.id = s.work_order_id
          JOIN catalog.items i ON i.id = w.item_id
          JOIN catalog.machines m ON m.id = COALESCE((e.before_state->>'machine_id')::uuid, s.machine_id)
          JOIN manufacturing.production_floors f ON f.id = m.production_floor_id
          WHERE e.organization_id = $1 AND f.code = $2 AND e.event_type = 'production.setup.reopened'

          UNION ALL
          SELECT 'rework:' || selected.id::text, 'rework', selected.selected_at, w.job_card_number, i.uid,
            NULL, COALESCE(selected.reason, 'Route ' || route.route_code), NULL, NULL, NULL, NULL, NULL, NULL
          FROM manufacturing.route_selections selected
          JOIN manufacturing.work_orders w ON w.id = selected.work_order_id AND w.organization_id = selected.organization_id
          JOIN manufacturing.route_options route ON route.id = selected.route_option_id
          JOIN manufacturing.production_floors f ON f.id = route.production_floor_id
          JOIN catalog.items i ON i.id = w.item_id
          WHERE selected.organization_id = $1 AND f.code = $2 AND selected.reversed_at IS NULL
            AND w.source_payload->>'isRevision' = 'true'

          UNION ALL
          SELECT 'dispatch:' || w.id::text, 'dispatch', sent.completed_at,
            w.job_card_number, i.uid, NULL, NULL, NULL,
            migration.try_date(job.row->>'committedDispatchDate'), NULL, NULL, NULL, NULL
          FROM floor_snapshot snapshot
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(
            snapshot.payload #> '{productionControl,productionDashboardRows}', '[]'::jsonb
          )) job(row)
          JOIN manufacturing.work_orders w ON w.organization_id = $1
            AND lower(w.job_card_number) = lower(job.row->>'jcNo')
          JOIN catalog.items i ON i.id = w.item_id
          JOIN LATERAL (
            SELECT max(occurred_at) AS completed_at FROM manufacturing.dispatch_approval_events
            WHERE organization_id = $1 AND work_order_id = w.id AND decision = 'approved' AND reversed_at IS NULL
          ) sent ON sent.completed_at IS NOT NULL
          WHERE job.row->>'status' = 'Dispatched'
            AND migration.try_date(job.row->>'committedDispatchDate') IS NOT NULL

          UNION ALL
          SELECT r.machine_id::text || ':' || r.production_date || ':' || r.shift,
            'machine', max(r.updated_at), NULL, NULL, m.machine_number,
            CASE WHEN count(DISTINCT r.reason) = 1 THEN min(r.reason) END,
            CASE WHEN count(DISTINCT COALESCE(r.note, '')) = 1 THEN min(r.note) END,
            r.production_date, r.shift, NULL, NULL, r.machine_id
          FROM manufacturing.cnc_shift_idle_reviews r
          JOIN catalog.machines m ON m.id = r.machine_id
          WHERE r.organization_id = $1 AND $2 = 'cnc'
          GROUP BY r.machine_id, m.machine_number, r.production_date, r.shift
        ), paged AS (
          SELECT * FROM completed ORDER BY completed_at DESC, id DESC LIMIT $3 OFFSET $4
        )
        SELECT paged.id, kind, to_jsonb(completed_at) #>> '{}' AS "completedAt",
          COALESCE(job_card, assignment.job_card_number) AS "jobCard",
          COALESCE(part, assignment.item) AS part, machine,
          COALESCE(paged.setup_number, assignment.setup_number::text) AS setup,
          reason, note, production_date::text AS "productionDate", shift, session_id AS "sessionId"
        FROM paged
        ${shiftSetupAssignmentJoin("paged.shift_machine_id", historyShiftEnd)}
        ORDER BY completed_at DESC, paged.id DESC`,
        [organizationId, floor, limit + 1, page * limit]
      )
      return { rows: rows.slice(0, limit), hasNext: rows.length > limit }
    },
  }
}
