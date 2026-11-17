import { repositoryPool, withRepositoryTransaction, type RepositoryPoolOptions } from "./postgres-runtime"
import { productionBreakIntervals, type ProductionBreak } from "./production-breaks"
import { productionShiftEndInstant } from "./production-session-domain"
import { buildShiftCoverage, type RecordedShiftInterval } from "./shift-coverage"
import { shiftSetupAssignmentJoin } from "./shift-setup-assignment"
import { shiftReasonRanges, shiftReasonVersion, type CncShift, type ShiftGapReview, type ShiftIdleMachine, type ShiftIdleReason } from "./shift-idle-reasons"

type ShiftKey = { organizationId: string; productionDate: string; shift: CncShift }
type Evidence = Omit<ShiftIdleMachine, "segments"> & {
  records: RecordedShiftInterval[]
  reviews: ShiftGapReview[]
  breaks: ProductionBreak[]
}

const evidenceSql = `
  WITH bounds AS (
    SELECT $4::timestamptz AS finish, $4::timestamptz - interval '8 hours' AS start
  ), fleet AS (
    SELECT m.id, m.machine_number, m.production_floor_id
    FROM catalog.machines m
    JOIN manufacturing.production_floors f ON f.id = m.production_floor_id
    WHERE m.organization_id = $1 AND m.active AND f.code = 'cnc'
      AND upper(m.machine_number) ~ '^CNC-[0-9]+$'
      AND ($5::uuid IS NULL OR m.id = $5)
  ), sessions AS (
    SELECT s.* FROM manufacturing.production_sessions s
    JOIN fleet ON fleet.id = s.machine_id CROSS JOIN bounds b
    WHERE s.organization_id = $1 AND s.reversed_at IS NULL AND s.started_at < b.finish
      AND (s.ended_at > b.start OR (s.ended_at IS NULL AND s.production_date = $2::date AND s.shift = $3))
  ), legacy AS (
    SELECT e.* FROM manufacturing.production_entries e
    JOIN fleet ON fleet.id = e.machine_id CROSS JOIN bounds b
    WHERE e.organization_id = $1 AND e.reversed_at IS NULL
      AND ((e.started_at < b.finish AND e.completed_at > b.start)
        OR (e.production_date = $2::date AND e.shift = $3
          AND (e.started_at IS NULL OR e.completed_at IS NULL OR e.completed_at <= e.started_at)))
      AND NOT EXISTS (
        SELECT 1 FROM manufacturing.production_sessions s WHERE s.production_entry_id = e.id
      )
  ), records AS (
    SELECT s.machine_id, CASE WHEN s.ended_at IS NULL THEN 'unclosed' ELSE 'running' END AS kind,
      s.started_at AS start, COALESCE(s.ended_at, b.finish) AS finish
    FROM sessions s CROSS JOIN bounds b
    UNION ALL
    SELECT l.machine_id, 'running', l.started_at, l.completed_at
    FROM legacy l WHERE l.completed_at > l.started_at
    UNION ALL
    SELECT s.machine_id, 'downtime', greatest(d.started_at, s.started_at),
      least(COALESCE(d.ended_at, b.finish), COALESCE(s.ended_at, b.finish))
    FROM sessions s JOIN manufacturing.production_session_downtime_events d ON d.production_session_id = s.id
    CROSS JOIN bounds b
    WHERE d.reversed_at IS NULL AND d.started_at < b.finish AND COALESCE(d.ended_at, b.finish) > b.start
    UNION ALL
    SELECT ms.machine_id, CASE WHEN lower(t.task_type) = 'breakdown' THEN 'breakdown' ELSE 'maintenance' END,
      t.started_at, COALESCE(t.completed_at, b.finish)
    FROM fleet m JOIN maintenance.machine_schedules ms ON ms.machine_id = m.id
    JOIN maintenance.tasks t ON t.machine_schedule_id = ms.id CROSS JOIN bounds b
    WHERE t.organization_id = $1 AND (
      (lower(t.task_type) = 'breakdown' AND
        (t.status = 'In Progress' OR (t.status = 'Completed' AND t.completed_at IS NOT NULL)))
      OR (lower(t.task_type) = 'planned' AND t.status = 'Completed' AND t.completed_at IS NOT NULL)
    )
      AND t.started_at < b.finish AND COALESCE(t.completed_at, b.finish) > b.start
  ), shift_breaks AS (
    SELECT m.production_floor_id, COALESCE((
      SELECT s.source_payload->'breakSchedule'
      FROM manufacturing.production_sessions s
      JOIN catalog.machines assigned ON assigned.id = s.machine_id
      WHERE s.organization_id = $1 AND assigned.production_floor_id = m.production_floor_id
        AND s.production_date = $2::date AND s.shift = $3 AND s.reversed_at IS NULL
        AND s.started_at < $4::timestamptz AND jsonb_typeof(s.source_payload->'breakSchedule') = 'array'
      ORDER BY s.started_at DESC, s.id DESC LIMIT 1
    ), schedule.breaks, '[]'::jsonb) AS breaks
    FROM (SELECT DISTINCT production_floor_id FROM fleet) m
    LEFT JOIN manufacturing.production_break_schedules schedule
      ON schedule.organization_id = $1 AND schedule.production_floor_id = m.production_floor_id
  )
  SELECT m.id AS "machineId", m.machine_number AS "machineNumber", assignment.job_card_number AS "jobCard",
    assignment.item, assignment.setup_number AS setup, assignment.stage,
    shift_breaks.breaks,
    EXISTS (SELECT 1 FROM legacy l WHERE l.machine_id = m.id
      AND l.quantity_good + l.quantity_rejected > 0
      AND (l.started_at IS NULL OR l.completed_at IS NULL OR l.completed_at <= l.started_at)) AS "untimedOutput",
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kind', r.kind, 'start', r.start, 'end', r.finish))
      FROM records r WHERE r.machine_id = m.id
    ), '[]'::jsonb) AS records,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('start', r.gap_start, 'end', r.gap_end,
        'reason', r.reason, 'note', r.note, 'version', r.row_version))
      FROM manufacturing.cnc_shift_idle_reviews r
      WHERE r.organization_id = $1 AND r.production_date = $2::date AND r.shift = $3 AND r.machine_id = m.id
    ), '[]'::jsonb) AS reviews
  FROM fleet m JOIN shift_breaks USING (production_floor_id)
  ${shiftSetupAssignmentJoin("m.id", "$4::timestamptz")}
  ORDER BY length(split_part(m.machine_number, '-', 2)), m.machine_number
`

export function createShiftIdleReviewRepository(options: RepositoryPoolOptions) {
  const { pool: readPool, close } = repositoryPool(options)

  async function readMachines(pool: typeof readPool, input: ShiftKey, machineId: string | null = null) {
    const endedAt = productionShiftEndInstant({ ...input, productionFloorCode: "cnc" })
    const startedAt = new Date(endedAt.getTime() - 8 * 60 * 60 * 1000)
    const window = { start: startedAt.toISOString(), end: endedAt.toISOString() }
    const { rows } = await pool.query<Evidence>(evidenceSql,
      [input.organizationId, input.productionDate, input.shift, endedAt, machineId])
    return rows.map(({ records, reviews, breaks, ...machine }): ShiftIdleMachine => {
      const scheduled = productionBreakIntervals(breaks, { startedAt, endedAt }).map((interval) => ({
        kind: "break" as const, start: interval.startedAt.toISOString(), end: interval.endedAt.toISOString(),
      }))
      return {
        ...machine,
        segments: buildShiftCoverage(window, [...records, ...scheduled], reviews.map((review) => ({
          ...review, start: new Date(review.start).toISOString(), end: new Date(review.end).toISOString(),
        }))),
      }
    })
  }

  return {
    close,
    async read(input: ShiftKey) {
      const machines = await readMachines(readPool, input)
      return { fleetSize: machines.length, machines }
    },
    async save(input: ShiftKey & {
      machineId: string
      actorUserId: string
      reason: ShiftIdleReason
      note: string | null
      version: string
    }) {
      return withRepositoryTransaction(options, async () => {
        const { pool } = repositoryPool(options)
        await pool.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        const [machine] = await readMachines(pool, input, input.machineId)
        if (!machine || machine.untimedOutput) return undefined
        const ranges = shiftReasonRanges(machine.segments)
        if (!ranges.length || shiftReasonVersion(ranges) !== input.version) return undefined
        const result = await pool.query<{ start: Date; end: Date; reason: ShiftIdleReason; note: string | null; version: number }>(
          `INSERT INTO manufacturing.cnc_shift_idle_reviews AS review (
            organization_id, production_date, shift, machine_id, gap_start, gap_end, reason, note, updated_by_user_id
          )
          SELECT $1, $2, $3, $4, gap.start, gap.finish, $5, $6, $7
          FROM unnest($8::timestamptz[], $9::timestamptz[]) AS gap(start, finish)
          ON CONFLICT (organization_id, production_date, shift, machine_id, gap_start, gap_end) DO UPDATE SET
            reason = EXCLUDED.reason, note = EXCLUDED.note, updated_by_user_id = EXCLUDED.updated_by_user_id,
            updated_at = now(), row_version = review.row_version + 1
          RETURNING gap_start AS start, gap_end AS end, reason, note, row_version AS version`,
          [input.organizationId, input.productionDate, input.shift, input.machineId,
            input.reason, input.note, input.actorUserId, ranges.map(({ start }) => start), ranges.map(({ end }) => end)]
        )
        return result.rows.map((row) => ({ ...row, start: row.start.toISOString(), end: row.end.toISOString() }))
      })
    },
  }
}
