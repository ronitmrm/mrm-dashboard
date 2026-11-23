import "server-only"

import {
  createDashboardReadModelRepository,
  createMaintenanceRepository,
  readFinishedGoods,
  repositoryPool,
} from "@workspace/db"
import {
  productionFloorCodeForRecord,
  type ProductionFloorCode,
} from "@workspace/db/production-floors"
import { shiftIdleReasons } from "@workspace/db/shift-idle-reasons"

import { readAuthEnvironment } from "./auth/auth"
import {
  cncDashboardCardSource,
  type CncDashboardCardId,
  type CncDashboardData,
  type CncDashboardFilters,
  type DashboardFloorScope,
} from "./cnc-dashboard"
import { loadCncSessionDashboard } from "./cnc-dashboard-data"
import {
  loadCncQualityWorkload,
  loadCncSetupWorkload,
  qualityWorkloadCards,
  setupWorkloadCards,
} from "./cnc-quality-data"
import { formatIstDate, formatIstDateTime, istDateValue } from "./date-time"
import {
  nextShopFloorStageId,
  shopFloorRowIsExplicitlyStopped,
  shopFloorRowIsProducedHistory,
  shopFloorRowIsProductionCurrent,
} from "./shop-floor-workflow"
import { dateSortValue } from "./dashboard-view-model"
import { shiftWindows, unitShiftAt } from "./dashboard-units"

type CardData = Pick<CncDashboardData, "charts" | "values" | "tables">
type Filter = CncDashboardFilters
const workflowStages = ["raw_material_at_machine", "operator_started"] as const
type Stage = (typeof workflowStages)[number]
const stageLabels: Record<Stage, string> = {
  raw_material_at_machine: "Material placed",
  operator_started: "Machine started",
}
type StageEvent = {
  stage: Stage
  at: Date
  job: string
  part: string
  machine: string
  actor: string | null
  setup: number
  floor: ProductionFloorCode
}

function timeSelection(
  value: Date | string,
  filters: Filter,
  floor: ProductionFloorCode
) {
  const at = new Date(value)
  if (!Number.isFinite(at.getTime())) return null
  const shift = unitShiftAt(floor, at)
  if (
    !shift ||
    shift.productionDate < filters.from ||
    shift.productionDate > filters.to
  )
    return null
  return filters.shift === "all" || filters.shift === shift.shift ? shift : null
}

function daysBefore(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

function chart<T>(
  rows: T[],
  label: (row: T) => string,
  amount: (row: T) => number = () => 1
) {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const key = label(row)
    totals.set(key, (totals.get(key) ?? 0) + amount(row))
  }
  return [...totals].map(([label, value]) => ({ label, value }))
}

function logRows(events: StageEvent[]) {
  return events.map(({ at, machine, job, part, setup, stage, actor }) => [
    formatIstDateTime(at),
    machine,
    job,
    part,
    setup,
    stageLabels[stage],
    actor ?? "—",
  ])
}

function rowRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value : []
}

function currentQueues(rows: Record<string, unknown>[]) {
  const grouped = new Map<string, Record<string, unknown>[]>()
  for (const row of rows) {
    const machine = String(row.machine ?? "").trim()
    if (
      !machine ||
      row.shopFloorStage === "item_complete" ||
      shopFloorRowIsProducedHistory(row)
    )
      continue
    const key = machine.toLowerCase()
    const queue = grouped.get(key) ?? []
    queue.push(row)
    grouped.set(key, queue)
  }
  return [...grouped.values()].flatMap((queue) => {
    const running = (row: Record<string, unknown>) =>
      !shopFloorRowIsExplicitlyStopped(row) &&
      shopFloorRowIsProductionCurrent(row)
    const next = queue
      .filter((row) => !running(row))
      .sort(
        (a, b) =>
          dateSortValue(
            a.plannedProductionStartDate || a.setupPlannedDate || a.plannedDate
          ) -
            dateSortValue(
              b.plannedProductionStartDate ||
                b.setupPlannedDate ||
                b.plannedDate
            ) ||
          String(a.setupNo ?? "").localeCompare(
            String(b.setupNo ?? ""),
            undefined,
            { numeric: true }
          ) ||
          String(a.partCode ?? "").localeCompare(
            String(b.partCode ?? ""),
            undefined,
            { numeric: true }
          )
      )[0]
    if (!next || next.shopFloorTaskReady === false) return []
    const stage = nextShopFloorStageId(next.shopFloorStage, next.machineType)
    return stage === "raw_material_at_machine" && queue.some(running)
      ? []
      : [{ row: next, stage }]
  })
}

async function loadWorkflow(
  filters: Filter,
  cards: readonly CncDashboardCardId[],
  scope: DashboardFloorScope
): Promise<CardData> {
  const options = { connectionString: readAuthEnvironment().connectionString }
  const publication = createDashboardReadModelRepository(options)
  const { pool, close } = repositoryPool(options)
  try {
    const organization = await publication.organizationIdForCode("MRMPL")
    const sources = new Set(cards.map(cncDashboardCardSource))
    const shopFloors = scope.shopFloorTasksTab ?? []
    const planFloors = scope.productionControlTab ?? []
    const snapshotFloors = [...new Set([...shopFloors, ...planFloors])]
    const dispatchPeriod =
      filters.from === filters.to && cards.includes("cnc-dispatch-trend")
        ? { ...filters, from: daysBefore(filters.from, 6) }
        : filters
    const [snapshots, events, dispatch, decisions, idle] = await Promise.all([
      Promise.all(
        snapshotFloors.map(async (floor) => ({
          floor,
          state: await publication.state(organization, {}, floor),
        }))
      ),
      sources.has("shopFloorTasksTab")
        ? pool.query<StageEvent>(
            `
        SELECT event.to_stage AS stage, event.occurred_at AS at,
          work.job_card_number AS job, item.uid AS part, machine.machine_number AS machine, setup.setup_number AS setup,
          COALESCE(NULLIF(event.legacy_actor, ''), actor.name) AS actor, floor.code AS floor
        FROM manufacturing.shop_floor_stage_events event
        JOIN manufacturing.shop_floor_setup_state state ON state.id = event.setup_state_id
        JOIN catalog.machines machine ON machine.id = COALESCE(event.machine_id, state.machine_id)
        JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
        JOIN manufacturing.work_orders work ON work.id = state.work_order_id
        JOIN catalog.items item ON item.id = work.item_id
        JOIN manufacturing.operation_setups setup ON setup.id = state.operation_setup_id
        LEFT JOIN identity.users actor ON actor.id = event.actor_user_id
        WHERE event.organization_id = $1 AND floor.code = ANY($5::text[]) AND event.reversed_at IS NULL
          AND event.to_stage = ANY($4::text[])
          AND event.occurred_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
          AND event.occurred_at < (($3::date + 1 + time '06:00') AT TIME ZONE 'Asia/Kolkata')
        ORDER BY event.occurred_at DESC, event.id
      `,
            [organization, filters.from, filters.to, workflowStages, shopFloors]
          )
        : null,
      sources.has("shopFloorTasksTab")
        ? pool.query<{
            at: Date
            job: string
            quantity: string | null
            actor: string | null
            floor: unknown
            workFloor: unknown
          }>(
            `
        SELECT event.occurred_at AS at, work.job_card_number AS job, event.quantity::text,
          COALESCE(NULLIF(event.legacy_actor, ''), actor.name) AS actor,
          event.source_payload AS floor, work.source_payload AS "workFloor"
        FROM manufacturing.dispatch_approval_events event
        JOIN manufacturing.work_orders work ON work.id = event.work_order_id
        LEFT JOIN identity.users actor ON actor.id = event.actor_user_id
        WHERE event.organization_id = $1 AND event.decision = 'approved' AND event.reversed_at IS NULL
          AND event.occurred_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
          AND event.occurred_at < (($3::date + 1 + time '06:00') AT TIME ZONE 'Asia/Kolkata')
        ORDER BY event.occurred_at DESC, event.id
      `,
            [organization, dispatchPeriod.from, dispatchPeriod.to]
          )
        : null,
      sources.has("productionControlTab")
        ? pool.query<{
            at: Date
            id: string
            job: string | null
            part: string | null
            machine: string | null
            priority: string | null
            rank: number | null
            status: string | null
            floorCode: string | null
            eventFloor: unknown
            workFloor: unknown
          }>(
            `
        SELECT event.id, event.occurred_at AS at, work.job_card_number AS job, item.uid AS part,
          machine.machine_number AS machine, event.source_payload->>'priority' AS priority,
          detail.target_position AS rank, work.status,
          floor.code AS "floorCode", event.source_payload AS "eventFloor", work.source_payload AS "workFloor"
        FROM manufacturing.planner_priority_events event
        LEFT JOIN manufacturing.planner_priority_event_details detail
          ON detail.planner_priority_event_id = event.id AND detail.sequence = 0
        LEFT JOIN manufacturing.work_orders work ON work.id = detail.work_order_id
        LEFT JOIN catalog.items item ON item.id = work.item_id
        LEFT JOIN catalog.machines machine ON machine.id = event.machine_id
        LEFT JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
        WHERE event.organization_id = $1 AND event.reversed_at IS NULL
          AND event.occurred_at < (($2::date + 1 + time '06:00') AT TIME ZONE 'Asia/Kolkata')
        ORDER BY event.occurred_at DESC, event.id
      `,
            [organization, filters.to]
          )
        : null,
      // Planner-explained idle time; gaps a later session now covers are stale.
      cards.includes("cnc-idle-reasons") && planFloors.includes("cnc")
        ? pool.query<{ reason: string; hours: number }>(
            `
        SELECT review.reason,
          round(sum(extract(epoch FROM review.gap_end - review.gap_start)) / 3600, 1)::float8 AS hours
        FROM manufacturing.cnc_shift_idle_reviews review
        WHERE review.organization_id = $1
          AND review.production_date BETWEEN $2::date AND $3::date
          AND ($4::text IS NULL OR review.shift = $4)
          AND NOT EXISTS (
            SELECT 1 FROM manufacturing.production_sessions session
            WHERE session.organization_id = review.organization_id
              AND session.machine_id = review.machine_id AND session.reversed_at IS NULL
              AND session.started_at < review.gap_end
              AND (session.ended_at > review.gap_start OR (session.ended_at IS NULL
                AND session.production_date = review.production_date AND session.shift = review.shift))
          )
        GROUP BY review.reason
        ORDER BY hours DESC, review.reason
      `,
            [
              organization,
              filters.from,
              filters.to,
              filters.shift === "all" ? null : filters.shift,
            ]
          )
        : null,
    ])
    const idleReasonLabels = new Map<string, string>(shiftIdleReasons)
    const controls = snapshots.flatMap(({ floor, state }) => {
      const control = (state.dashboard as Record<string, unknown> | null)
        ?.productionControl as Record<string, unknown> | undefined
      return control ? [{ floor, control }] : []
    })
    const control = controls.length ? controls : null
    const plansOf = (floors: readonly ProductionFloorCode[]) =>
      controls.flatMap(({ floor, control }) =>
        floors.includes(floor) ? rowRecords(control.machinePlanDetailRows) : []
      )
    const plans = plansOf(planFloors)
    const queue = currentQueues(plansOf(shopFloors))
    const floorWork = (events?.rows ?? []).filter(
      ({ stage, at, floor }) =>
        (stage === "raw_material_at_machine" || stage === "operator_started") &&
        timeSelection(at, filters, floor)
    )
    const placements = floorWork.filter(
      ({ stage }) => stage === "raw_material_at_machine"
    )
    const trendRows = (dispatch?.rows ?? []).flatMap((row) => {
      const eventFloor =
        row.floor && typeof row.floor === "object" ? row.floor : {}
      const workFloor =
        row.workFloor && typeof row.workFloor === "object" ? row.workFloor : {}
      const floor = productionFloorCodeForRecord({
        sourcePayload: { ...workFloor, ...eventFloor },
      })
      if (!floor || !shopFloors.includes(floor)) return []
      const shift = timeSelection(row.at, dispatchPeriod, floor)
      return shift ? [{ ...row, date: shift.productionDate }] : []
    })
    const dispatchRows = trendRows.filter(({ date }) => date >= filters.from)
    const dailyDispatch = new Map<
      string,
      { approvals: number; pieces: number; complete: boolean }
    >()
    const dispatchSpan = Math.round(
      (Date.parse(dispatchPeriod.to) - Date.parse(dispatchPeriod.from)) /
        86_400_000
    )
    if (dispatchSpan >= 0 && dispatchSpan < 31) {
      for (let offset = dispatchSpan; offset >= 0; offset--) {
        dailyDispatch.set(daysBefore(dispatchPeriod.to, offset), {
          approvals: 0,
          pieces: 0,
          complete: true,
        })
      }
    }
    for (const { date, quantity } of trendRows) {
      const total = dailyDispatch.get(date) ?? {
        approvals: 0,
        pieces: 0,
        complete: true,
      }
      total.approvals++
      total.complete &&= quantity !== null
      total.pieces += Number(quantity ?? 0)
      dailyDispatch.set(date, total)
    }
    const dispatchDays = [...dailyDispatch].sort(([a], [b]) =>
      a.localeCompare(b)
    )
    const priorities = (decisions?.rows ?? []).flatMap((row) => {
      const eventFloor =
        row.eventFloor && typeof row.eventFloor === "object"
          ? row.eventFloor
          : {}
      const workFloor =
        row.workFloor && typeof row.workFloor === "object" ? row.workFloor : {}
      const floor = (row.floorCode ??
        productionFloorCodeForRecord({
          sourcePayload: { ...workFloor, ...eventFloor },
        })) as ProductionFloorCode | null
      return floor &&
        planFloors.includes(floor) &&
        (filters.shift === "all" ||
          unitShiftAt(floor, row.at)?.shift === filters.shift)
        ? [{ ...row, floor }]
        : []
    })
    const jobs = new Map(
      controls
        .filter(({ floor }) => planFloors.includes(floor))
        .flatMap(({ control }) =>
          rowRecords(control.workOrderRegisterRows ?? control.workOrders)
        )
        .map(
        (row) => [
          String(row.jcNo ?? row.jobCardNumber ?? "").toLowerCase(),
          row,
        ]
      )
    )
    const latestPriorities = new Map<string, (typeof priorities)[number]>()
    for (const decision of priorities) {
      const key = decision.job?.toLowerCase() || decision.id
      if (!latestPriorities.has(key)) latestPriorities.set(key, decision)
    }
    const priorityRows = [...latestPriorities.values()].flatMap(
      ({ at, job, part, machine, priority, rank, status, floor }) => {
        const jobKey = job?.toLowerCase() ?? ""
        const progress = jobs.get(jobKey)
        const plan = plans.find(
          (row) =>
            String(row.jcNo ?? row.jobCardNumber ?? "").toLowerCase() === jobKey
        )
        const state = String(progress?.dispatchStatus ?? status ?? "Unmatched")
        if (/^(dispatched|cancelled|rejected)$/i.test(state)) return []
        const phase = /partially dispatched/i.test(state)
          ? "Partially dispatched"
          : Number(progress?.rawRows ?? 0) > 0 ||
              (plan && shopFloorRowIsProductionCurrent(plan))
            ? "In production"
            : plan && plan.shopFloorTaskReady !== false
              ? "Ready for setup"
              : !job
                ? "Unmatched"
                : state
        const ordered = Number(progress?.orderPcs ?? 0)
        const actual = Number(progress?.finalSetupGoodPieces ?? 0)
        return [
          [
            formatIstDateTime(at),
            part ?? "—",
            job ?? "—",
            machine ?? String(plan?.machine ?? "—"),
            priority ?? rank ?? "—",
            phase,
            timeSelection(at, filters, floor) ? "Yes" : "No",
            ordered > 0
              ? `${Math.min(100, (actual / ordered) * 100).toFixed(1)}%`
              : "—",
            String(plan?.plannedProductionEndDate || "—"),
            progress?.finalSetupGoodPieces != null
              ? `${actual.toLocaleString("en-IN")} final setup good pieces`
              : "—",
          ],
        ]
      }
    )
    const columns = [
      "Recorded at",
      "Machine",
      "Job card",
      "Part",
      "Setup",
      "Task",
      "User",
    ]
    const queueColumns = ["Machine", "Job card", "Part", "Setup", "Next task"]
    const queueTable = (stageList: string[]) => ({
      columns: queueColumns,
      rows: queue
        .filter(({ stage }) => stage && stageList.includes(stage))
        .map(({ row, stage }) => [
          String(row.machine ?? "—"),
          String(row.jcNo ?? row.jobCardNumber ?? "—"),
          String(row.partCode ?? "—"),
          String(row.setupNo ?? "—"),
          stage === "setting"
            ? "Complete setting"
            : stage === "operator_started"
              ? "Start machine"
              : "Place material",
        ]),
    })
    return {
      values: {
        "cnc-floor-pending": control
          ? queue.filter(({ stage }) => stage === "raw_material_at_machine")
              .length
          : null,
        "cnc-floor-placements": floorWork.filter(
          ({ stage }) => stage === "raw_material_at_machine"
        ).length,
        "cnc-floor-starts": floorWork.filter(
          ({ stage }) => stage === "operator_started"
        ).length,
        "cnc-dispatch-pieces": dispatchRows.some(
          ({ quantity }) => quantity === null
        )
          ? null
          : dispatchRows.reduce(
              (total, row) => total + Number(row.quantity),
              0
            ),
        "cnc-dispatch-approvals": dispatchRows.length,
      },
      charts: {
        "cnc-idle-reasons": (idle?.rows ?? []).map(({ reason, hours }) => ({
          label: idleReasonLabels.get(reason) ?? reason,
          value: hours,
        })),
        "cnc-floor-by-user": chart(
          placements,
          ({ actor }) => actor ?? "Unrecorded"
        ),
        "cnc-dispatch-trend": dispatchDays.flatMap(([label, total]) =>
          total.complete ? [{ label, value: total.pieces }] : []
        ),
      },
      tables: {
        "cnc-dispatch-daily": {
          columns: ["Production date", "Approval events", "Dispatched pieces"],
          rows: dispatchDays.map(([date, total]) => [
            date,
            total.approvals,
            total.complete ? total.pieces : "—",
          ]),
        },
        "cnc-floor-log": { columns, rows: logRows(placements) },
        "cnc-dispatch-log": {
          columns: ["Approved at", "Job card", "Pieces", "User"],
          rows: dispatchRows.map(({ at, job, quantity, actor }) => [
            formatIstDateTime(at),
            job,
            quantity === null ? "—" : Number(quantity),
            actor ?? "—",
          ]),
        },
        "cnc-planner-priorities": {
          columns: [
            "Changed at",
            "Part",
            "Job card",
            "Machine",
            "Priority",
            "Current progress",
            "Changed in selection",
            "Final setup progress",
            "Estimated finish",
            "Recorded output",
          ],
          rows: priorityRows,
        },
        ...(control
          ? {
              "cnc-floor-queue": queueTable(["raw_material_at_machine"]),
            }
          : {}),
      },
    }
  } finally {
    await Promise.all([publication.close(), close()])
  }
}

async function loadMaintenance(
  filters: Filter,
  cards: readonly CncDashboardCardId[],
  floors: readonly ProductionFloorCode[]
): Promise<CardData> {
  const options = { connectionString: readAuthEnvironment().connectionString }
  const repository = createMaintenanceRepository(options)
  const { pool, close } = repositoryPool(options)
  try {
    const organization = await repository.organizationIdForCode("MRMPL")
    const [breakdowns, plan, completed, overdue] = await Promise.all([
      repository.listBreakdowns({
        organizationId: organization,
        status: cards.includes("cnc-maintenance-breakdowns-started")
          ? undefined
          : "In Progress",
      }),
      Promise.all(
        floors.map((productionFloorCode) =>
          repository.listMachineMaintenancePlan(
            organization,
            filters.from,
            filters.to,
            { productionFloorCode }
          )
        )
      ).then((plans) => plans.flat()),
      pool.query<{
        floor: ProductionFloorCode
        machine: string
        work: string
        type: string
        at: Date
        minutes: number | null
      }>(
        `
        SELECT floor.code AS floor, machine.machine_number AS machine, definition.name AS work, task.task_type AS type,
          task.completed_at AS at,
          CASE WHEN task.source_payload->>'actualMinutes' ~ '^[0-9]+([.][0-9]+)?$'
            THEN (task.source_payload->>'actualMinutes')::float8
            WHEN task.started_at IS NOT NULL AND task.completed_at > task.started_at
            THEN extract(epoch FROM task.completed_at - task.started_at)::float8 / 60
          END AS minutes
        FROM maintenance.tasks task
        JOIN maintenance.machine_schedules schedule ON schedule.id = task.machine_schedule_id
        JOIN maintenance.definitions definition ON definition.id = schedule.definition_id
        JOIN catalog.machines machine ON machine.id = schedule.machine_id
        JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
        WHERE task.organization_id = $1 AND floor.code = ANY($4::text[]) AND task.status = 'Completed'
          AND task.completed_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata')
          AND task.completed_at < (($3::date + 1 + time '06:00') AT TIME ZONE 'Asia/Kolkata')
        ORDER BY task.completed_at DESC, task.id
      `,
        [organization, filters.from, filters.to, floors]
      ),
      cards.includes("cnc-maintenance-backlog")
        ? Promise.all(
            floors.map((productionFloorCode) =>
              repository.listMachineMaintenancePlan(
                organization,
                "0001-01-01",
                daysBefore(istDateValue(), 1),
                { outstandingOnly: true, productionFloorCode }
              )
            )
          ).then((plans) => plans.flat())
        : [],
    ])
    const floorBreakdowns = breakdowns.flatMap((breakdown) => {
      const floor = floors.find(
        (code) => code === breakdown.productionFloorCode
      )
      return floor ? [{ ...breakdown, floor }] : []
    })
    const openBreakdowns = floorBreakdowns.filter(
      ({ status }) => status === "In Progress"
    )
    // End of the last selected shift on the final date, per unit.
    const cutoff = (floor: ProductionFloorCode) =>
      shiftWindows(floor, { ...filters, from: filters.to }).at(-1)?.[1] ?? 0
    const done = completed.rows.filter(({ at, floor }) =>
      timeSelection(at, filters, floor)
    )
    const timed = done.flatMap(({ minutes }) =>
      minutes === null ? [] : [minutes]
    )
    const repairs = done.filter(
      ({ type }) => type.toLowerCase() === "breakdown"
    )
    const repairTimes = repairs.flatMap(({ minutes }) =>
      minutes === null ? [] : [minutes]
    )
    return {
      values: {
        "cnc-open-breakdowns": new Set(
          openBreakdowns.map(({ machineNumber }) => machineNumber)
        ).size,
        "cnc-maintenance-breakdowns-intersecting": openBreakdowns.filter(
          ({ startedAt, floor }) =>
            !!startedAt && new Date(startedAt).getTime() < cutoff(floor)
        ).length,
        "cnc-maintenance-breakdowns-started": floorBreakdowns.filter(
          ({ startedAt, floor }) =>
            startedAt && timeSelection(startedAt, filters, floor)
        ).length,
        "cnc-maintenance-repairs": repairs.length,
        "cnc-maintenance-repair-avg": repairTimes.length
          ? Math.round(
              repairTimes.reduce((sum, minutes) => sum + minutes, 0) /
                repairTimes.length
            )
          : null,
        "cnc-maintenance-planned": plan.length,
        "cnc-maintenance-completed": done.filter(
          ({ type }) => type.toLowerCase() === "planned"
        ).length,
        "cnc-maintenance-duration": timed.length
          ? Math.round(
              timed.reduce((total, minutes) => total + minutes, 0) /
                timed.length
            )
          : null,
      },
      charts: {},
      tables: {
        "cnc-breakdown-log": {
          columns: ["Machine", "Started at", "Reason"],
          rows: openBreakdowns.map(
            ({ machineNumber, startedAt, reasonName }) => [
              machineNumber,
              formatIstDateTime(startedAt),
              reasonName ?? "—",
            ]
          ),
        },
        "cnc-maintenance-work": {
          columns: [
            "Machine",
            "Work",
            "Record",
            "Date",
            "Actual minutes",
            "Type",
          ],
          rows: [
            ...plan.map(({ machineNumber, maintenance, dueOn }) => [
              machineNumber,
              maintenance,
              "Plan",
              dueOn,
              "—",
              "Planned",
            ]),
            ...done.map(({ machine, work, at, minutes, type }) => [
              machine,
              work,
              "Completed",
              formatIstDateTime(at),
              minutes === null ? "—" : Math.round(minutes),
              type,
            ]),
          ],
        },
        "cnc-maintenance-backlog": {
          columns: ["Machine", "Work", "Due date", "Status"],
          rows: overdue.map(({ machineNumber, maintenance, dueOn, status }) => [
            machineNumber,
            maintenance,
            dueOn,
            status,
          ]),
        },
      },
    }
  } finally {
    await Promise.all([repository.close(), close()])
  }
}

const finishedGoodsCards = [
  "cnc-finished-goods",
  "cnc-finished-goods-daily",
  "cnc-finished-goods-jobs",
] as const

/** Final-setup output only; earlier setups are work in progress. */
async function loadFinishedGoods(
  filters: Filter,
  floors: readonly ProductionFloorCode[]
): Promise<CardData> {
  const options = { connectionString: readAuthEnvironment().connectionString }
  const publication = createDashboardReadModelRepository(options)
  const { pool, close } = repositoryPool(options)
  try {
    const rows = floors.length
      ? await readFinishedGoods(pool, {
          organizationId: await publication.organizationIdForCode("MRMPL"),
          productionFloorCodes: floors,
          from: filters.from,
          to: filters.to,
        })
      : []
    const days = new Map<string, { good: number; rejected: number }>()
    const jobs = new Map<
      string,
      { row: (typeof rows)[number]; inRange: number; toDate: number; selected: boolean }
    >()
    for (const row of rows) {
      const key = `${row.productionFloorCode}|${row.jobCardNumber}`
      const job = jobs.get(key) ?? { row, inRange: 0, toDate: 0, selected: false }
      job.toDate += row.goodPieces
      if (
        row.productionDate >= filters.from &&
        row.productionDate <= filters.to &&
        (filters.shift === "all" || row.shift === filters.shift)
      ) {
        job.inRange += row.goodPieces
        job.selected = true
        const day = days.get(row.productionDate) ?? { good: 0, rejected: 0 }
        day.good += row.goodPieces
        day.rejected += row.rejectedPieces
        days.set(row.productionDate, day)
      }
      jobs.set(key, job)
    }
    const selected = [...jobs.values()].filter((job) => job.selected)
    return {
      values: {
        "cnc-finished-goods": selected.reduce((sum, job) => sum + job.inRange, 0),
      },
      charts: {},
      tables: {
        "cnc-finished-goods-daily": {
          columns: ["Production date", "Finished pcs", "Rejected pcs"],
          rows: [...days]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, day]) => [formatIstDate(date), day.good, day.rejected]),
        },
        "cnc-finished-goods-jobs": {
          columns: [
            "Job card",
            "Part code",
            "Description",
            "Final setup",
            "Ordered pcs",
            "Finished in selection",
            "Finished to date",
            "Dispatched pcs",
            "Ready to dispatch",
          ],
          rows: selected
            .sort((a, b) =>
              a.row.jobCardNumber.localeCompare(b.row.jobCardNumber, "en-IN", {
                numeric: true,
              })
            )
            .map(({ row, inRange, toDate }) => [
              row.jobCardNumber,
              row.partCode,
              row.description ?? "—",
              row.finalSetupNumber,
              row.orderedQuantity,
              inRange,
              toDate,
              row.dispatchedPieces,
              Math.max(toDate - row.dispatchedPieces, 0),
            ]),
        },
      },
    }
  } finally {
    await Promise.all([publication.close(), close()])
  }
}

export async function loadCncDashboard(
  filters: Filter,
  cards: readonly CncDashboardCardId[],
  scope: DashboardFloorScope,
  includeWorkloadDetails = false
): Promise<CncDashboardData> {
  const sources = new Set(cards.map(cncDashboardCardSource))
  const [session, workflow, maintenance, qualityWorkload, setupWorkload, finished] =
    await Promise.all([
      sources.has("productionSessionsTab")
        ? loadCncSessionDashboard(
            filters,
            cards,
            scope.productionSessionsTab ?? []
          )
        : null,
      sources.has("shopFloorTasksTab") || sources.has("productionControlTab")
        ? loadWorkflow(filters, cards, scope)
        : null,
      sources.has("maintenanceTab")
        ? loadMaintenance(filters, cards, scope.maintenanceTab ?? [])
        : null,
      sources.has("qualityControlTasksTab")
        ? loadCncQualityWorkload(filters, scope.qualityControlTasksTab ?? [])
        : undefined,
      sources.has("machinistTasksTab")
        ? loadCncSetupWorkload(filters, scope.machinistTasksTab ?? [])
        : undefined,
      finishedGoodsCards.some((id) => cards.includes(id))
        ? loadFinishedGoods(filters, scope.productionSessionsTab ?? [])
        : null,
    ])
  const quality = qualityWorkload && qualityWorkloadCards(qualityWorkload)
  const setup = setupWorkload && setupWorkloadCards(setupWorkload)
  const selected = new Set<string>(cards)
  function picked<T>(records: Partial<Record<CncDashboardCardId, T>>) {
    return Object.fromEntries(
      Object.entries(records).filter(([id]) => selected.has(id))
    ) as typeof records
  }
  return {
    qualityWorkload: includeWorkloadDetails ? qualityWorkload : undefined,
    setupWorkload: includeWorkloadDetails ? setupWorkload : undefined,
    sessionCount: session?.sessionCount,
    machines: selected.has("cnc-machine-output")
      ? (session?.machines ?? [])
      : [],
    values: picked({
      ...session?.values,
      ...workflow?.values,
      ...maintenance?.values,
      ...quality?.values,
      ...setup?.values,
      ...finished?.values,
    }),
    charts: picked({
      ...session?.charts,
      ...workflow?.charts,
      ...maintenance?.charts,
      ...quality?.charts,
      ...setup?.charts,
      ...finished?.charts,
    }),
    tables: picked({
      ...session?.tables,
      ...workflow?.tables,
      ...maintenance?.tables,
      ...quality?.tables,
      ...setup?.tables,
      ...finished?.tables,
    }),
  }
}
