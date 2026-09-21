import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import { productionFloors } from "./production-floors"
import {
  productionRejectionStage,
  validateRejectionEntry,
  type RejectionRegisterRow,
} from "./rejection-domain"
import { rejectionEntriesFromRow } from "./legacy-dashboard-analysis"

// Work Order unit ownership uses the same persisted payload rule as Shop Floor.
const unitSql = `derived.dashboard_production_floor_code(w.source_payload)`
type Job = {
  id: string
  jobCard: string
  partCode: string
  unit: string
}
export function createRejectionRepository(options: RepositoryPoolOptions) {
  const { pool, close } = repositoryPool(options)
  return {
    close,
    async organizationId() {
      const row = (
        await pool.query<{ id: string }>(
          "SELECT id FROM core.organizations WHERE code = 'MRMPL'"
        )
      ).rows[0]
      if (!row) throw new Error("Organization not found.")
      return row.id
    },
    async entryOptions(
      organizationId: string,
      filters: { unit: string; part: string; job: string }
    ) {
      const [jobs, types, defects, reasons] = await Promise.all([
        pool.query<Job>(
          `SELECT w.id, w.job_card_number AS "jobCard", i.uid AS "partCode", ${unitSql} AS unit
          FROM manufacturing.work_orders w JOIN catalog.items i ON i.id = w.item_id
          WHERE w.organization_id = $1 AND w.status <> 'Cancelled' AND ($2 = '' OR ${unitSql} = $2)
            AND ($3 = '' OR i.uid ILIKE '%' || $3 || '%') AND ($4 = '' OR w.job_card_number ILIKE '%' || $4 || '%')
          ORDER BY w.job_card_number, w.id LIMIT 101`,
          [organizationId, filters.unit, filters.part, filters.job]
        ),
        pool.query<{ id: string; label: string }>(
          "SELECT id, name AS label FROM quality.rejection_types WHERE organization_id = $1 AND active AND code NOT LIKE '__LEGACY%' ORDER BY name",
          [organizationId]
        ),
        pool.query<{ id: string; label: string }>(
          "SELECT id, name AS label FROM quality.rejection_reasons WHERE organization_id = $1 AND active AND code NOT LIKE '__LEGACY%' ORDER BY name",
          [organizationId]
        ),
        pool.query<{ id: string; label: string }>(
          "SELECT id, remark AS label FROM quality.rejection_remarks WHERE organization_id = $1 AND active ORDER BY remark",
          [organizationId]
        ),
      ])
      return {
        jobs: jobs.rows.slice(0, 100).map((job) => ({
          id: job.id,
          jobCard: job.jobCard,
          partCode: job.partCode,
          unit: job.unit,
        })),
        hasMore: jobs.rows.length > 100,
        types: types.rows,
        defects: defects.rows,
        reasons: reasons.rows,
      }
    },
    async save(input: {
      organizationId: string
      userId: string
      requestId: string
      jobId: string
      date: string
      stage: string
      typeId: string
      defectId: string
      reasonId: string
      pieces: number
      kg: number
    }) {
      validateRejectionEntry(input)
      return withTransaction(pool, async (client) => {
        const job = (
          await client.query<Job>(
            `SELECT w.id, ${unitSql} AS unit FROM manufacturing.work_orders w
             WHERE w.id = $1 AND w.organization_id = $2 AND w.status <> 'Cancelled'
             FOR SHARE`,
            [input.jobId, input.organizationId]
          )
        ).rows[0]
        if (!job) throw new Error("Select a valid Job Card.")
        const masters = (
          await client.query<{ type: string; defect: string; reason: string }>(
            `SELECT t.name AS type, d.name AS defect, r.remark AS reason
          FROM quality.rejection_types t, quality.rejection_reasons d, quality.rejection_remarks r
          WHERE t.id = $2 AND d.id = $3 AND r.id = $4 AND t.organization_id = $1 AND d.organization_id = $1 AND r.organization_id = $1
            AND t.active AND d.active AND r.active`,
            [input.organizationId, input.typeId, input.defectId, input.reasonId]
          )
        ).rows[0]
        if (!masters)
          throw new Error("Select active rejection type, defect and reason.")
        return (
          await client.query<{ id: string }>(
            `INSERT INTO quality.rejection_entries
          (organization_id, work_order_id, production_floor_code, rejection_date, stage, type_name, defect_name, reason_name, pieces, kg, entered_by_user_id, request_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (organization_id, request_id) DO NOTHING RETURNING id`,
            [
              input.organizationId,
              input.jobId,
              job.unit,
              input.date,
              input.stage,
              masters.type,
              masters.defect,
              masters.reason,
              input.pieces,
              input.kg,
              input.userId,
              input.requestId,
            ]
          )
        ).rows[0]
      })
    },
    async list(
      organizationId: string,
      filters: { from: string; to: string; unit: string }
    ) {
      const values = [organizationId, filters.from, filters.to, filters.unit]
      const [entries, sessions, legacy] = await Promise.all([
        pool.query<RejectionRegisterRow>(
          `SELECT e.id, w.job_card_number AS "jobCard", i.uid AS "partCode", e.rejection_date::text AS date,
          e.production_floor_code AS unit, e.stage, e.type_name AS type, e.defect_name AS defect, e.reason_name AS reason,
          e.pieces, e.kg::float8 AS kg, 'Entered kg' AS "weightBasis"
          FROM quality.rejection_entries e JOIN manufacturing.work_orders w ON w.id = e.work_order_id JOIN catalog.items i ON i.id = w.item_id
          WHERE e.organization_id = $1 AND e.rejection_date BETWEEN $2::date AND $3::date AND ($4 = '' OR e.production_floor_code = $4)`,
          values
        ),
        pool.query<RejectionRegisterRow>(
          `SELECT e.id, s.job_card_number_snapshot AS "jobCard", s.part_code_snapshot AS "partCode",
          (e.recorded_at AT TIME ZONE 'Asia/Kolkata')::date::text AS date, f.code AS unit, '' AS stage,
          e.type_name AS type, e.reason_name AS defect, e.remark_name AS reason, e.quantity AS pieces,
          CASE WHEN s.piece_weight_grams > 0 THEN (e.quantity * s.piece_weight_grams / 1000)::float8 END AS kg,
          'Calculated from session piece weight' AS "weightBasis"
          FROM manufacturing.production_session_rejection_events e JOIN manufacturing.production_sessions s ON s.id = e.production_session_id
          JOIN catalog.machines m ON m.id = s.machine_id JOIN manufacturing.production_floors f ON f.id = m.production_floor_id
          WHERE e.organization_id = $1 AND e.reversed_at IS NULL AND s.reversed_at IS NULL
            AND (e.recorded_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date AND ($4 = '' OR f.code = $4)`,
          values
        ),
        pool.query<{
          id: string
          jobCard: string
          partCode: string
          date: string
          unit: string
          pieces: string
          payload: Record<string, unknown>
        }>(
          `SELECT e.id, w.job_card_number AS "jobCard", i.uid AS "partCode", e.production_date::text AS date,
            COALESCE(f.code, ${unitSql}) AS unit, e.quantity_rejected::text AS pieces, e.source_payload AS payload
           FROM manufacturing.production_entries e JOIN manufacturing.work_orders w ON w.id = e.work_order_id
           JOIN catalog.items i ON i.id = w.item_id LEFT JOIN catalog.machines m ON m.id = e.machine_id
           LEFT JOIN manufacturing.production_floors f ON f.id = m.production_floor_id
           WHERE e.organization_id = $1 AND e.reversed_at IS NULL AND e.production_date BETWEEN $2::date AND $3::date
             AND ($4 = '' OR COALESCE(f.code, ${unitSql}) = $4)
             AND NOT EXISTS (SELECT 1 FROM manufacturing.production_sessions s WHERE s.production_entry_id = e.id)`,
          values
        ),
      ])
      const historical: RejectionRegisterRow[] = legacy.rows.flatMap((row) => {
        const payload = row.payload ?? {}
        let details = rejectionEntriesFromRow(payload)
        if (!details.length && Number(row.pieces) > 0)
          details = [
            {
              qty: Number(row.pieces),
              type: payload.rejectionType,
              reason: payload.rejectionReason,
              remark: payload.rejectionRemark,
            },
          ]
        return details.map((detail, index) => ({
          id: `${row.id}:${index}`,
          jobCard: row.jobCard,
          partCode: row.partCode,
          date: row.date,
          unit: row.unit,
          stage: productionRejectionStage(String(detail.type ?? "")),
          type: String(detail.type ?? "Unclassified"),
          defect: String(detail.reason ?? ""),
          reason: String(detail.remark ?? ""),
          pieces: Number(detail.qty),
          kg: null,
          weightBasis: "Not recorded",
        }))
      })
      return [
        ...entries.rows,
        ...sessions.rows.map((row) => ({
          ...row,
          stage: productionRejectionStage(row.type),
        })),
        ...historical,
      ]
        .map((row) => ({
          ...row,
          unit:
            productionFloors.find((floor) => floor.code === row.unit)?.label ??
            row.unit,
        }))
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            a.jobCard.localeCompare(b.jobCard) ||
            a.id.localeCompare(b.id)
        )
    },
  }
}
