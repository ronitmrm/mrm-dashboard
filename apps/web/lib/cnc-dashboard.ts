export const cncDashboardCards = {
  "cnc-sessions-started": [
    "Production session starts",
    "Production",
    "Sessions recorded across the selected shifts.",
  ],
  "cnc-machines-reporting": [
    "Machines reporting production",
    "Production",
    "Machines with recorded output in the selection.",
  ],
  "cnc-setup-avg-minutes": [
    "Avg reported setup time",
    "Machinist",
    "Average recorded setting time for matched starts and completions.",
  ],
  "cnc-maintenance-breakdowns-intersecting": [
    "Open breakdown records intersecting shift",
    "Maintenance",
    "Currently open records started before the selection ended.",
  ],
  "cnc-maintenance-breakdowns-started": [
    "Breakdowns started in selection",
    "Maintenance",
    "Breakdown start events recorded in the selected shifts.",
  ],
  "cnc-maintenance-repairs": [
    "Repairs completed",
    "Maintenance",
    "Recorded breakdown completions in the selected shifts.",
  ],
  "cnc-maintenance-repair-avg": [
    "Average repair time",
    "Maintenance",
    "Average recorded duration of completed breakdown jobs.",
  ],
  "cnc-good-pieces": [
    "Good pieces",
    "Production",
    "Accepted pieces recorded in production sessions.",
  ],
  "cnc-production-capacity": [
    "Session-based capacity vs actual",
    "Production",
    "Output and capacity from recorded allocation less scheduled breaks.",
  ],
  "cnc-machine-activity": [
    "Machine activity",
    "Production",
    "Machines with output, no session evidence or recorded downtime.",
  ],
  "cnc-machine-capacity": [
    "Machine-wise capacity & downtime breakdown",
    "Production",
    "Actual output, session-based capacity and downtime per machine.",
  ],
  "cnc-machine-hours-detail": [
    "Machine-wise time breakdown",
    "Production",
    "Elapsed CNC shift hours split by recorded sessions, stops and configured breaks.",
  ],
  "cnc-shift-detail": [
    "Shift production comparison",
    "Production",
    "Output, rejects, downtime and sessions across all three CNC shifts.",
  ],
  "cnc-dispatch-daily": [
    "Daily dispatch quantities",
    "Shop Floor",
    "Recorded approvals and dispatched quantities by production date.",
  ],
  "cnc-setup-workload": [
    "Total setup workload",
    "Machinist",
    "Carry-in and newly received setup tasks.",
  ],
  "cnc-setup-recorded-minutes": [
    "Recorded setup time",
    "Machinist",
    "Recorded time from setting start to setting completion.",
  ],
  "cnc-machinist-downtime": [
    "Machinist-entered downtime",
    "Machinist",
    "Recorded stop events entered by machinists.",
  ],
  "cnc-machinist-downtime-log": [
    "Machinist-entered production downtime",
    "Machinist",
    "Machine, reason and recorded minutes for stops entered by machinists.",
  ],
  "cnc-floor-operators": [
    "Operators · selected shifts",
    "Shop Floor",
    "Distinct operators with a recorded production session.",
  ],
  "cnc-floor-efficiency": [
    "Combined production efficiency",
    "Shop Floor",
    "Standard time earned divided by measured session runtime.",
  ],
  "cnc-floor-operator-detail": [
    "Operator-wise efficiency",
    "Shop Floor",
    "Recorded operator IDs, machines and efficiency.",
  ],
  "cnc-pieces-produced": [
    "Pieces produced",
    "Production",
    "Recorded output, including rejects.",
  ],
  "cnc-pieces-rejected": [
    "Rejected pieces",
    "Quality",
    "Rejected pieces recorded in production sessions.",
  ],
  "cnc-logged-downtime": [
    "Logged downtime",
    "Maintenance",
    "Total time recorded as stopped in production sessions.",
  ],
  "cnc-open-sessions": [
    "Open sessions",
    "Production",
    "Sessions in the selection that are still open.",
  ],
  "cnc-shift-comparison": [
    "Compare all three shifts",
    "Production",
    "Recorded pieces per shift across the selected dates.",
  ],
  "cnc-machine-output": [
    "Machine production breakdown",
    "Production",
    "Output, rejects, and downtime for machines with sessions in this selection.",
  ],
  "cnc-downtime-reasons": [
    "Why machines stopped",
    "Maintenance",
    "Top recorded reasons for completed downtime events.",
  ],
  "cnc-rejection-reasons": [
    "Defects recorded",
    "Quality",
    "Top recorded reasons by number of rejected pieces.",
  ],
  "cnc-rejection-causes": [
    "Recorded defect causes",
    "Quality",
    "Rejected quantity by the recorded cause.",
  ],
  "cnc-rejection-rate": [
    "Rejection rate",
    "Quality",
    "Rejected pieces as a share of recorded output.",
  ],
  "cnc-operator-efficiency": [
    "Operator efficiency",
    "Production",
    "Standard time earned divided by net runtime for completed sessions with a cycle standard.",
  ],
  "cnc-machine-hours": [
    "Machine hours",
    "Production",
    "Recorded runtime, logged stops, and breaks across matching sessions.",
  ],
  "cnc-fleet-hours": [
    "Fleet hours coverage",
    "Production",
    "Elapsed shift hours for active CNC machines and the share covered by recorded sessions.",
  ],
  "cnc-machine-availability": [
    "Machine availability",
    "Production",
    "Session evidence for each active CNC machine in the selection.",
  ],
  "cnc-operator-output": [
    "Operator output and efficiency",
    "Production",
    "Recorded output by operator and efficiency for completed sessions with a cycle standard.",
  ],
  "cnc-setup-pending": [
    "Pending at shift end",
    "Machinist",
    "Setup requests still pending at the end of the selected shift.",
  ],
  "cnc-setup-queue": [
    "Pending setups",
    "Machinist",
    "Setup requests awaiting setting completion at the cut-off.",
  ],
  "cnc-setups-completed": [
    "Setups completed",
    "Machinist",
    "Recorded setting completions in the selected period.",
  ],
  "cnc-setup-duration": [
    "Setup time by machine",
    "Machinist",
    "Recorded setting start to completion on the same setup.",
  ],
  "cnc-settings-by-user": [
    "Settings completed by user",
    "Machinist",
    "Setting completions credited to each recorded user.",
  ],
  "cnc-setup-log": [
    "Setup receipts and completions",
    "Machinist",
    "Machines, jobs and users from recorded setting completions.",
  ],
  "cnc-qc-requests": [
    "Approval requests received",
    "Quality",
    "Setting completions that entered the quality queue in the selection.",
  ],
  "cnc-qc-average-wait": [
    "Avg approval wait",
    "Quality",
    "Average elapsed time from setting done to approval for matched records.",
  ],
  "cnc-qc-pending": [
    "Pending at shift end",
    "Quality",
    "Requests still awaiting approval at the end of the selection.",
  ],
  "cnc-qc-queue": [
    "Pending approvals",
    "Quality",
    "Machines and jobs still awaiting approval at the end of the selection.",
  ],
  "cnc-qc-completed": [
    "Approvals given",
    "Quality",
    "Recorded approval completions in the selected period.",
  ],
  "cnc-qc-wait": [
    "Approval wait by machine",
    "Quality",
    "Time between recorded setting completion and quality approval on the same setup.",
  ],
  "cnc-qc-by-user": [
    "Approvals by user",
    "Quality",
    "Recorded quality approvals credited to each user.",
  ],
  "cnc-qc-log": [
    "Quality approval log",
    "Quality",
    "Machines, jobs and users from recorded approvals.",
  ],
  "cnc-rejection-log": [
    "Rejection stages, machines and parts",
    "Quality",
    "Affected machines, parts, recorded causes and rejection stages.",
  ],
  "cnc-floor-pending": [
    "Pending material placements",
    "Shop Floor",
    "Current machine queues ready for raw material placement.",
  ],
  "cnc-floor-queue": [
    "Pending material placement details",
    "Shop Floor",
    "Current jobs and machines ready for material placement. Independent of the historical filters.",
  ],
  "cnc-floor-placements": [
    "Material placements completed",
    "Shop Floor",
    "Recorded raw material placements in the selected period.",
  ],
  "cnc-floor-starts": [
    "Completed machine starts",
    "Shop Floor",
    "Machine starts recorded in the selected period.",
  ],
  "cnc-floor-by-user": [
    "Shop-floor tasks by user",
    "Shop Floor",
    "Recorded placements and starts credited to each user.",
  ],
  "cnc-floor-log": [
    "Material-placement completion log",
    "Shop Floor",
    "Machines, jobs and users from recorded placements.",
  ],
  "cnc-dispatch-pieces": [
    "Dispatched pieces",
    "Shop Floor",
    "Pieces on recorded dispatch approvals in the selected period.",
  ],
  "cnc-dispatch-approvals": [
    "Dispatch approvals",
    "Shop Floor",
    "Recorded approved dispatch events in the selected period.",
  ],
  "cnc-dispatch-trend": [
    "Dispatch trend",
    "Shop Floor",
    "Approved dispatch quantities by CNC production date.",
  ],
  "cnc-dispatch-log": [
    "Dispatch approval log",
    "Shop Floor",
    "Approval dates, jobs, recorded quantities and users.",
  ],
  "cnc-open-breakdowns": [
    "Open breakdowns",
    "Maintenance",
    "Current open mechanical breakdowns. Independent of the date and shift filters.",
  ],
  "cnc-breakdown-log": [
    "Open breakdown details",
    "Maintenance",
    "Machines, reasons and recorded start times for current breakdowns.",
  ],
  "cnc-downtime-log": [
    "Downtime events",
    "Maintenance",
    "Machines, reasons, timing and duration for recorded production stops.",
  ],
  "cnc-maintenance-planned": [
    "Planned maintenance",
    "Maintenance",
    "Jobs due in the selected dates. Plans have no shift assignment.",
  ],
  "cnc-maintenance-completed": [
    "Completed planned maintenance",
    "Maintenance",
    "Planned jobs completed in the selected dates and shift.",
  ],
  "cnc-maintenance-duration": [
    "Average maintenance time",
    "Maintenance",
    "Average recorded duration of completed maintenance with timing data.",
  ],
  "cnc-maintenance-work": [
    "Planned and completed maintenance",
    "Maintenance",
    "Scheduled jobs and completed maintenance records for the selected period.",
  ],
  "cnc-maintenance-backlog": [
    "Preventive maintenance backlog",
    "Maintenance",
    "Current planned CNC work past its due date.",
  ],
  "cnc-planner-priorities": [
    "Priority changes and progress",
    "Planning",
    "Recorded priority decisions in the selected period and the latest known job progress.",
  ],
} as const

export type CncDashboardCardId = keyof typeof cncDashboardCards

export const cncDashboardCardIds = Object.keys(
  cncDashboardCards
) as CncDashboardCardId[]

export function isCncDashboardCard(id: string): id is CncDashboardCardId {
  return Object.hasOwn(cncDashboardCards, id)
}

export const cncDashboardDepartments = {
  production: "Production",
  quality: "Quality",
  machinist: "Machinist",
  "shop-floor": "Shop Floor",
  maintenance: "Maintenance",
  planning: "Planning",
} as const

export type CncDashboardDepartment = keyof typeof cncDashboardDepartments

export const productionOverviewCards: readonly CncDashboardCardId[] = [
  "cnc-pieces-rejected",
  "cnc-logged-downtime",
  "cnc-downtime-reasons",
  "cnc-downtime-log",
  "cnc-qc-completed",
  "cnc-qc-average-wait",
  "cnc-qc-log",
  "cnc-rejection-rate",
  "cnc-rejection-reasons",
  "cnc-rejection-causes",
  "cnc-rejection-log",
  "cnc-setups-completed",
  "cnc-setup-recorded-minutes",
  "cnc-setup-avg-minutes",
  "cnc-setup-log",
  "cnc-open-breakdowns",
  "cnc-maintenance-breakdowns-intersecting",
  "cnc-maintenance-breakdowns-started",
  "cnc-maintenance-repairs",
  "cnc-maintenance-repair-avg",
  "cnc-breakdown-log",
  "cnc-maintenance-backlog",
  "cnc-planner-priorities",
]

export function cncDashboardIncludes(
  department: CncDashboardDepartment,
  id: CncDashboardCardId
) {
  return (
    cncDashboardCards[id][1] === cncDashboardDepartments[department] ||
    (department === "production" && productionOverviewCards.includes(id))
  )
}

export function cncDashboardCardSource(id: CncDashboardCardId) {
  if (
    [
      "cnc-floor-operators",
      "cnc-floor-efficiency",
      "cnc-floor-operator-detail",
      "cnc-machinist-downtime",
      "cnc-machinist-downtime-log",
    ].includes(id)
  )
    return "productionSessionsTab"
  if (id.startsWith("cnc-setup") || id === "cnc-settings-by-user")
    return "machinistTasksTab"
  if (id.startsWith("cnc-qc-")) return "qualityControlTasksTab"
  if (id.startsWith("cnc-floor-") || id.startsWith("cnc-dispatch-"))
    return "shopFloorTasksTab"
  if (
    id.startsWith("cnc-maintenance-") ||
    id === "cnc-open-breakdowns" ||
    id === "cnc-breakdown-log"
  )
    return "maintenanceTab"
  if (id === "cnc-planner-priorities") return "productionControlTab"
  return "productionSessionsTab"
}

export const cncShifts = ["A", "B", "C"] as const

export type CncDashboardFilters = {
  from: string
  shift: "all" | (typeof cncShifts)[number]
  to: string
}

export type CncQualityRequest = {
  id: string
  at: string
  machine: string
  job: string
  part: string
  setup: string
}

export type CncQualityApproval = CncQualityRequest & {
  user: string
  requestedAt: string | null
  waitMinutes: number | null
}

export type CncQualityWorkload = {
  carryIn: number
  received: number
  pending: CncQualityRequest[]
  approvals: CncQualityApproval[]
  endAt: string
}

export type CncDashboardData = {
  qualityWorkload?: CncQualityWorkload
  setupWorkload?: CncSetupWorkload
  sessionCount?: number
  values: Partial<Record<CncDashboardCardId, number | null>>
  charts: Partial<
    Record<CncDashboardCardId, { label: string; value: number }[]>
  >
  tables?: Partial<
    Record<
      CncDashboardCardId,
      { columns: string[]; rows: (number | string)[][] }
    >
  >
  machines: {
    machine: string
    jobs: string[]
    produced: number
    rejected: number
    downtime: number
  }[]
}

export type CncSetupWorkload = CncQualityWorkload & {
  moved: number
  receipts: CncQualityRequest[]
}
