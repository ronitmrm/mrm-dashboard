import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"
import {
  buildQualityReport,
  type QualityProduction,
  type QualityRequest,
  type QualityRun,
  type QualityCheck,
  type QualityDefect,
} from "./quality-report-domain"
import { rejectionEntriesFromRow } from "./legacy-dashboard-analysis"
import {
  productionShiftAt,
  productionShiftEndInstant,
} from "./production-session-domain"

export function createQualityReportRepository(options: RepositoryPoolOptions) {
  const { pool, close } = repositoryPool(options)
  return {
    close,
    async load(input: {
      from: string
      to: string
      floors: string[]
      inspectors: string[]
    }) {
      const org = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE code = 'MRMPL'"
      )
      if (!org.rows[0]) throw new Error("MRMPL organization was not found")
      const values = [org.rows[0].id, input.from, input.to, input.floors]
      const [production, requests, runs, checks, events, legacy] =
        await Promise.all([
          pool.query<QualityProduction>(
            `WITH output AS (
        SELECT s.machine_id,s.production_date,s.shift,s.quantity_good,s.quantity_rejected
        FROM manufacturing.production_sessions s
        WHERE s.organization_id=$1 AND s.reversed_at IS NULL AND s.production_date BETWEEN $2::date AND $3::date
        UNION ALL
        SELECT e.machine_id,e.production_date,e.shift,e.quantity_good,e.quantity_rejected
        FROM manufacturing.production_entries e
        WHERE e.organization_id=$1 AND e.reversed_at IS NULL AND e.production_date BETWEEN $2::date AND $3::date
        AND NOT EXISTS(SELECT 1 FROM manufacturing.production_sessions s WHERE s.production_entry_id=e.id)
      ) SELECT o.production_date::text AS date,COALESCE(o.shift,'Unspecified') AS shift,m.machine_number AS machine,
        sum(o.quantity_good)::float8 AS good,sum(o.quantity_rejected)::float8 AS rejected
        FROM output o JOIN catalog.machines m ON m.id=o.machine_id
        JOIN manufacturing.production_floors f ON f.id=m.production_floor_id
        WHERE f.code=ANY($4::text[]) GROUP BY o.production_date,o.shift,m.machine_number`,
            values
          ),
          pool.query<QualityRequest & { floor: string }>(
            `WITH settings AS (
        SELECT e.id,e.occurred_at,e.setup_state_id,e.machine_id,e.source_payload,
          lead(e.occurred_at) OVER(PARTITION BY e.setup_state_id,e.machine_id ORDER BY e.occurred_at,e.id) AS next_setting
        FROM manufacturing.shop_floor_stage_events e
        WHERE e.organization_id=$1 AND e.to_stage='setting' AND e.reversed_at IS NULL
      ) SELECT e.id::text,e.occurred_at::text AS "requestedAt",approval.inspected_at::text AS "approvedAt",
        LEAST(e.next_setting,closure.occurred_at)::text AS "closedAt",
        approval.inspector,COALESCE(NULLIF(e.source_payload->>'shift',''),'Unspecified') AS shift,f.code AS floor
      FROM settings e JOIN manufacturing.shop_floor_setup_state state ON state.id=e.setup_state_id
      JOIN catalog.machines m ON m.id=e.machine_id JOIN manufacturing.production_floors f ON f.id=m.production_floor_id
      JOIN manufacturing.work_orders w ON w.id=state.work_order_id
      LEFT JOIN LATERAL (
        SELECT min(event.occurred_at) AS occurred_at,
          min(event.occurred_at) FILTER (WHERE event.to_stage IN ('planned','item_complete')) AS ended_at
        FROM manufacturing.shop_floor_stage_events event
        WHERE event.organization_id=$1 AND event.setup_state_id=e.setup_state_id AND event.machine_id=e.machine_id
          AND event.reversed_at IS NULL AND event.occurred_at>=e.occurred_at
          AND event.to_stage IN ('planned','quality_approval','operator_started','item_complete')
      ) closure ON true
      LEFT JOIN LATERAL (
        SELECT i.inspected_at,COALESCE(NULLIF(i.legacy_inspector,''),u.name,'Unspecified') AS inspector
        FROM quality.first_piece_inspections i LEFT JOIN identity.users u ON u.id=i.inspector_user_id
        WHERE i.organization_id=$1 AND i.work_order_id=state.work_order_id AND i.operation_setup_id=state.operation_setup_id
          AND i.machine_id=e.machine_id AND i.reversed_at IS NULL AND lower(i.status) IN ('approved','ok')
          AND (NULLIF(i.source_payload->>'taskAssignedAt','') IS NULL
            OR migration.try_timestamptz(i.source_payload->>'taskAssignedAt')=e.occurred_at)
          AND i.inspected_at>=e.occurred_at AND (e.next_setting IS NULL OR i.inspected_at<e.next_setting)
          AND (closure.ended_at IS NULL OR i.inspected_at<=closure.ended_at)
        ORDER BY i.inspected_at,i.id LIMIT 1
      ) approval ON true
      WHERE f.code=ANY($4::text[]) AND e.occurred_at < (($3::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
        AND (approval.inspected_at IS NULL OR approval.inspected_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
          OR e.occurred_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata'))
        AND w.status<>'Cancelled'`,
            values
          ),
          pool.query<
            QualityRun & {
              floor: string
              productionDate: string
              status: string
            }
          >(
            `SELECT s.id::text,m.machine_number AS machine,s.work_order_id::text AS "workOrder",f.code AS floor,s.production_date::text AS "productionDate",s.status,
        s.operation_setup_id::text AS setup,s.shift,s.started_at::text AS start,LEAST(COALESCE(s.ended_at,now()),now())::text AS "end",
        COALESCE(s.source_payload->'breakSchedule',schedule.breaks,'[]'::jsonb) AS breaks,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('start',d.started_at,'end',COALESCE(d.ended_at,now())))
          FROM manufacturing.production_session_downtime_events d WHERE d.production_session_id=s.id AND d.reversed_at IS NULL),'[]') AS downtime
        FROM manufacturing.production_sessions s JOIN catalog.machines m ON m.id=s.machine_id
        JOIN manufacturing.production_floors f ON f.id=m.production_floor_id
        LEFT JOIN manufacturing.production_break_schedules schedule ON schedule.organization_id=s.organization_id AND schedule.production_floor_id=f.id
        WHERE s.organization_id=$1 AND s.reversed_at IS NULL AND f.code=ANY($4::text[])
        AND s.started_at < (($3::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
        AND COALESCE(s.ended_at,now()) > ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')`,
            values
          ),
          pool.query<QualityCheck>(
            `SELECT m.machine_number AS machine,c.work_order_id::text AS "workOrder",c.operation_setup_id::text AS setup,
        COALESCE(NULLIF(c.source_payload->>'prodDate',''),(c.checked_at AT TIME ZONE 'Asia/Kolkata')::date::text) AS date,
        COALESCE(NULLIF(c.source_payload->>'hourSlot',''),to_char(c.checked_at AT TIME ZONE 'Asia/Kolkata','HH24:00')) AS hour
        FROM quality.hourly_checks c JOIN catalog.machines m ON m.id=c.machine_id
        JOIN manufacturing.production_floors f ON f.id=m.production_floor_id
        WHERE c.organization_id=$1 AND c.reversed_at IS NULL AND f.code=ANY($4::text[])
        AND COALESCE(NULLIF(c.source_payload->>'prodDate',''),(c.checked_at AT TIME ZONE 'Asia/Kolkata')::date::text) BETWEEN $2 AND $3`,
            values
          ),
          pool.query<QualityDefect>(
            `SELECT s.production_date::text AS date,s.shift,
        e.reason_name AS defect,e.quantity::float8 AS pieces
        FROM manufacturing.production_session_rejection_events e JOIN manufacturing.production_sessions s ON s.id=e.production_session_id
        JOIN catalog.machines m ON m.id=s.machine_id JOIN manufacturing.production_floors f ON f.id=m.production_floor_id
        WHERE e.organization_id=$1 AND e.reversed_at IS NULL AND s.reversed_at IS NULL AND f.code=ANY($4::text[])
        AND s.production_date BETWEEN $2::date AND $3::date`,
            values
          ),
          pool.query<{
            date: string
            shift: string
            rejected: number
            payload: Record<string, unknown>
          }>(
            `SELECT e.production_date::text AS date,
        COALESCE(e.shift,'Unspecified') AS shift,e.quantity_rejected::float8 AS rejected,e.source_payload AS payload
        FROM manufacturing.production_entries e JOIN catalog.machines m ON m.id=e.machine_id
        JOIN manufacturing.production_floors f ON f.id=m.production_floor_id
        WHERE e.organization_id=$1 AND e.reversed_at IS NULL AND f.code=ANY($4::text[]) AND e.quantity_rejected>0
        AND e.production_date BETWEEN $2::date AND $3::date
        AND NOT EXISTS(SELECT 1 FROM manufacturing.production_sessions s WHERE s.production_entry_id=e.id)`,
            values
          ),
        ])
      const historical = legacy.rows.flatMap((row) => {
        const entries = rejectionEntriesFromRow(row.payload ?? {})
        return entries.length
          ? entries.map((entry) => ({
              date: row.date,
              shift: row.shift,
              defect: String(entry.reason || "Unclassified"),
              pieces: Number(entry.qty),
            }))
          : [
              {
                date: row.date,
                shift: row.shift,
                defect: String(row.payload?.rejectionReason || "Unclassified"),
                pieces: row.rejected,
              },
            ]
      })
      return buildQualityReport(
        {
          production: production.rows,
          requests: requests.rows.map((row) => ({
            ...row,
            shift:
              row.shift === "Unspecified"
                ? (productionShiftAt(row.floor, new Date(row.requestedAt))
                    ?.shift ?? "Unspecified")
                : row.shift,
          })),
          runs: runs.rows.map((row) => ({
            ...row,
            end:
              row.status === "open"
                ? new Date(
                    Math.min(
                      Date.parse(row.end),
                      productionShiftEndInstant({
                        productionDate: row.productionDate,
                        productionFloorCode: row.floor,
                        shift: row.shift,
                      }).getTime()
                    )
                  ).toISOString()
                : row.end,
          })),
          checks: checks.rows,
          inspectors: input.inspectors,
          defects: [...events.rows, ...historical],
        },
        input.from,
        input.to
      )
    },
  }
}
