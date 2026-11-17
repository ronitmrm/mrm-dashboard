import "server-only"

import {
  createProductionShopFloorRepository,
  repositoryPool,
} from "@workspace/db"
import {
  productionShiftAt,
  productionShiftEndInstant,
} from "@workspace/db/production-session-domain"

import { readAuthEnvironment } from "./auth/auth"
import type {
  CncDashboardData,
  CncDashboardFilters,
  CncQualityApproval,
  CncQualityRequest,
  CncQualityWorkload,
  CncSetupWorkload,
} from "./cnc-dashboard"
import { formatIstDateTime } from "./date-time"

type QueueEvent = Omit<CncQualityRequest, "at"> & {
  at: Date
  stage: string
  user: string | null
  settingStartedAt: Date | null
}

export function loadCncQualityWorkload(
  filters: CncDashboardFilters
): Promise<CncQualityWorkload> {
  return readWorkload(filters, "quality")
}

export function loadCncSetupWorkload(
  filters: CncDashboardFilters
): Promise<CncSetupWorkload> {
  return readWorkload(filters, "setup")
}

async function readWorkload(
  filters: CncDashboardFilters,
  kind: "setup" | "quality"
): Promise<CncSetupWorkload> {
  const setupWork = kind === "setup"
  const requestStages = setupWork
    ? ["raw_material_at_machine", "presetting"]
    : ["setting"]
  const completionStage = setupWork ? "setting" : "quality_approval"
  const firstShift = filters.shift === "all" ? "A" : filters.shift
  const lastShift = filters.shift === "all" ? "C" : filters.shift
  const start = new Date(
    productionShiftEndInstant({
      productionDate: filters.from,
      productionFloorCode: "cnc",
      shift: firstShift,
    }).getTime() -
      8 * 60 * 60 * 1000
  )
  const end = new Date(
    Math.min(
      Date.now(),
      productionShiftEndInstant({
        productionDate: filters.to,
        productionFloorCode: "cnc",
        shift: lastShift,
      }).getTime()
    )
  )
  if (end <= start)
    return {
      carryIn: 0,
      received: 0,
      pending: [],
      approvals: [],
      moved: 0,
      receipts: [],
      endAt: start.toISOString(),
    }

  const options = { connectionString: readAuthEnvironment().connectionString }
  const repository = createProductionShopFloorRepository(options)
  const { pool, close } = repositoryPool(options)
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const { rows } = await pool.query<QueueEvent>(
      `
      WITH cnc_events AS NOT MATERIALIZED (
        SELECT event.id AS event_id, event.setup_state_id, event.occurred_at,
          event.to_stage, event.actor_user_id, event.legacy_actor, machine.machine_number, machine.id AS machine_id
        FROM manufacturing.shop_floor_stage_events event
        JOIN manufacturing.shop_floor_setup_state setup_state ON setup_state.id = event.setup_state_id
        JOIN catalog.machines machine ON machine.id = COALESCE(event.machine_id, setup_state.machine_id)
        JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
        WHERE event.organization_id = $1 AND floor.code = 'cnc'
          AND event.reversed_at IS NULL AND event.from_stage IS DISTINCT FROM event.to_stage
      ),
      prior AS (
        SELECT DISTINCT ON (setup_state_id) *
        FROM cnc_events
        WHERE occurred_at < $2
        ORDER BY setup_state_id, occurred_at DESC, event_id DESC
      ),
      timeline AS (
        SELECT * FROM prior WHERE to_stage = ANY($4::text[])
        UNION ALL
        SELECT * FROM cnc_events WHERE occurred_at >= $2 AND occurred_at < $3
      )
      SELECT timeline.setup_state_id AS id, timeline.occurred_at AS at,
        timeline.to_stage AS stage, timeline.machine_number AS machine,
        work.job_card_number AS job, item.uid AS part, setup.setup_number::text AS setup,
        COALESCE(NULLIF(timeline.legacy_actor, ''), actor.name) AS "user",
        COALESCE(start_event.at, checklist.at) AS "settingStartedAt"
      FROM timeline
      JOIN manufacturing.shop_floor_setup_state setup_state ON setup_state.id = timeline.setup_state_id
      JOIN manufacturing.work_orders work ON work.id = setup_state.work_order_id
      JOIN manufacturing.operation_setups setup ON setup.id = setup_state.operation_setup_id
      JOIN catalog.items item ON item.id = work.item_id
      LEFT JOIN identity.users actor ON actor.id = timeline.actor_user_id
      LEFT JOIN LATERAL (
        SELECT max(event.occurred_at) AS at FROM manufacturing.shop_floor_stage_events event
        WHERE $5::boolean AND timeline.to_stage = 'setting' AND event.setup_state_id = setup_state.id
          AND event.reversed_at IS NULL AND event.occurred_at < timeline.occurred_at
          AND event.to_stage IN ('setting', 'planned', 'item_complete', 'raw_material_at_machine')
      ) boundary ON true
      LEFT JOIN LATERAL (
        SELECT max(event.occurred_at) AS at FROM manufacturing.shop_floor_stage_events event
        WHERE $5::boolean AND timeline.to_stage = 'setting' AND event.setup_state_id = setup_state.id
          AND event.reversed_at IS NULL AND event.to_stage = 'presetting'
          AND event.occurred_at > COALESCE(boundary.at, '-infinity'::timestamptz)
          AND event.occurred_at <= timeline.occurred_at
      ) start_event ON true
      LEFT JOIN LATERAL (
        SELECT max(session.started_at) AS at FROM quality.setup_checklist_sessions session
        WHERE $5::boolean AND timeline.to_stage = 'setting'
          AND session.work_order_id = work.id AND session.operation_setup_id = setup.id
          AND session.machine_id = timeline.machine_id AND session.reversed_at IS NULL
          AND session.started_at >= COALESCE(boundary.at, '-infinity'::timestamptz)
          AND session.started_at <= timeline.occurred_at
      ) checklist ON true
      ORDER BY timeline.occurred_at, timeline.event_id
    `,
      [organizationId, start, end, requestStages, setupWork]
    )

    const pending = new Map<string, CncQualityRequest>()
    const approvals: CncQualityApproval[] = []
    const receipts: CncQualityRequest[] = []
    let carryIn = 0
    let received = 0
    let moved = 0
    for (const { at, stage, user, settingStartedAt, ...details } of rows) {
      const request = pending.get(details.id)
      const event = { ...details, at: at.toISOString() }
      const selected =
        at >= start &&
        (filters.shift === "all" ||
          productionShiftAt("cnc", at)?.shift === filters.shift)
      if (requestStages.includes(stage)) {
        if (!request) {
          pending.set(details.id, event)
          if (at < start) carryIn++
          if (selected) {
            received++
            receipts.push(event)
          }
        }
      } else {
        pending.delete(details.id)
        if (setupWork && request && stage === "planned" && selected) moved++
        if (stage === completionStage && selected) {
          const startedAt = setupWork
            ? settingStartedAt?.toISOString()
            : request?.at
          approvals.push({
            ...event,
            user: user ?? "Unrecorded",
            requestedAt: request?.at ?? null,
            waitMinutes: startedAt
              ? (at.getTime() - Date.parse(startedAt)) / 60_000
              : null,
          })
        }
      }
    }
    return {
      carryIn,
      received,
      approvals,
      moved,
      receipts,
      pending: [...pending.values()],
      endAt: end.toISOString(),
    }
  } finally {
    await Promise.all([repository.close(), close()])
  }
}

export function averageApprovalWait(approvals: readonly CncQualityApproval[]) {
  const waits = approvals.flatMap(({ waitMinutes }) =>
    waitMinutes === null ? [] : [waitMinutes]
  )
  return waits.length
    ? Math.round(
        (waits.reduce((total, wait) => total + wait, 0) / waits.length) * 10
      ) / 10
    : null
}

export function setupWorkloadCards(
  workload: CncSetupWorkload
): Pick<CncDashboardData, "values" | "charts" | "tables"> {
  const shared = qualityWorkloadCards(workload)
  const recorded = workload.approvals.flatMap(({ waitMinutes }) =>
    waitMinutes === null ? [] : [waitMinutes]
  )
  return {
    values: {
      "cnc-setup-workload": workload.carryIn + workload.received,
      "cnc-setups-completed": workload.approvals.length,
      "cnc-setup-pending": workload.pending.length,
      "cnc-setup-avg-minutes": averageApprovalWait(workload.approvals),
      "cnc-setup-recorded-minutes": recorded.length
        ? Math.round(recorded.reduce((a, b) => a + b, 0) * 10) / 10
        : null,
    },
    charts: {
      "cnc-setup-duration": shared.charts["cnc-qc-wait"],
      "cnc-settings-by-user": shared.charts["cnc-qc-by-user"],
    },
    tables: {
      "cnc-setup-queue": shared.tables?.["cnc-qc-queue"],
      "cnc-setup-log": {
        columns: [
          "Recorded at",
          "Machine",
          "Job card",
          "Part",
          "Setup",
          "Event",
          "User",
          "Recorded setup min",
        ],
        rows: [
          ...workload.receipts.map(({ at, machine, job, part, setup }) => [
            formatIstDateTime(at),
            machine,
            job,
            part,
            setup,
            "Received",
            "—",
            "—",
          ]),
          ...workload.approvals.map(
            ({ at, machine, job, part, setup, user, waitMinutes }) => [
              formatIstDateTime(at),
              machine,
              job,
              part,
              setup,
              "Completed",
              user,
              waitMinutes === null ? "—" : Math.round(waitMinutes * 10) / 10,
            ]
          ),
        ],
      },
    },
  }
}

export function qualityWorkloadCards(
  workload: CncQualityWorkload
): Pick<CncDashboardData, "values" | "charts" | "tables"> {
  const counts = new Map<string, number>()
  const machineWaits = new Map<string, CncQualityApproval[]>()
  for (const approval of workload.approvals) {
    counts.set(approval.user, (counts.get(approval.user) ?? 0) + 1)
    const rows = machineWaits.get(approval.machine) ?? []
    rows.push(approval)
    machineWaits.set(approval.machine, rows)
  }
  return {
    values: {
      "cnc-qc-requests": workload.received,
      "cnc-qc-completed": workload.approvals.length,
      "cnc-qc-pending": workload.pending.length,
      "cnc-qc-average-wait": averageApprovalWait(workload.approvals),
    },
    charts: {
      "cnc-qc-by-user": [...counts]
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value })),
      "cnc-qc-wait": [...machineWaits].flatMap(([label, rows]) => {
        const value = averageApprovalWait(rows)
        return value === null ? [] : [{ label, value }]
      }),
    },
    tables: {
      "cnc-qc-queue": {
        columns: ["Machine", "Job card", "Part", "Setup", "Requested at"],
        rows: workload.pending.map(({ machine, job, part, setup, at }) => [
          machine,
          job,
          part,
          setup,
          formatIstDateTime(at),
        ]),
      },
      "cnc-qc-log": {
        columns: [
          "Approved at",
          "Machine",
          "Job card",
          "Part",
          "Setup",
          "User",
          "Wait (min)",
        ],
        rows: workload.approvals.map(
          ({ at, machine, job, part, setup, user, waitMinutes }) => [
            formatIstDateTime(at),
            machine,
            job,
            part,
            setup,
            user,
            waitMinutes === null ? "—" : Math.round(waitMinutes * 10) / 10,
          ]
        ),
      },
    },
  }
}
