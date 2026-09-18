import { createHash, randomUUID } from "node:crypto"
import { queueDashboardRefresh } from "./dashboard-refresh-queue"
import { repositoryPool, withTransaction, type RepositoryPoolOptions } from "./postgres-runtime"

export type ProductionOpeningRow = {
  jobCardNumber: string
  partCode: string
  optionNumber: string
  setupNumber: number
  machineNumber: string | null
  goodPieces: number
  rejectedPieces: number
  status: "running" | "completed"
}

export function parseProductionOpeningBatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Opening batch must be an object.")
  const batch = value as Record<string, unknown>
  if (typeof batch.cutoffAt !== "string" || !/T\d{2}:\d{2}:\d{2}\+05:30$/.test(batch.cutoffAt) || !Number.isFinite(Date.parse(batch.cutoffAt))) {
    throw new Error("cutoffAt must be an IST timestamp, for example 2026-09-18T22:00:00+05:30.")
  }
  if (new Date(Date.parse(batch.cutoffAt) + 330 * 60_000).toISOString().slice(0, 19) !== batch.cutoffAt.slice(0, 19)) {
    throw new Error("Cutoff date or time is invalid.")
  }
  if (!Array.isArray(batch.rows) || !batch.rows.length) throw new Error("Opening rows are required.")
  if (batch.rows.length > 5000) throw new Error("Opening batch exceeds the dashboard's 5,000-setup capacity.")
  const keys = new Set<string>()
  const machines = new Set<string>()
  const rows = batch.rows.map((value: unknown): ProductionOpeningRow => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid opening row.")
    const row = value as Record<string, unknown>
    const text = (key: string) => {
      if (typeof row[key] !== "string" || !row[key].trim()) throw new Error(`${key} is required.`)
      return row[key].trim()
    }
    const integer = (key: string, minimum: number) => {
      const number = row[key]
      if (typeof number !== "number" || !Number.isSafeInteger(number) || number < minimum) throw new Error(`${key} must be an integer >= ${minimum}.`)
      return number
    }
    if (row.status !== "running" && row.status !== "completed") throw new Error("Opening state must be running or completed.")
    const result: ProductionOpeningRow = {
      jobCardNumber: text("jobCardNumber"), partCode: text("partCode"), optionNumber: text("optionNumber"),
      setupNumber: integer("setupNumber", 1), goodPieces: integer("goodPieces", 0), rejectedPieces: integer("rejectedPieces", 0),
      status: row.status, machineNumber: row.status === "running" ? text("machineNumber") : null,
    }
    const key = JSON.stringify([result.jobCardNumber.toLowerCase(), result.partCode.toLowerCase(), result.optionNumber.toLowerCase(), result.setupNumber])
    if (keys.has(key)) throw new Error(`Duplicate opening setup: ${result.jobCardNumber}/${result.setupNumber}.`)
    keys.add(key)
    if (result.machineNumber) {
      const machine = result.machineNumber.toLowerCase()
      if (machines.has(machine)) throw new Error(`Multiple running setups on ${result.machineNumber}.`)
      machines.add(machine)
    }
    return result
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return { cutoffAt: batch.cutoffAt, rows }
}

export function createProductionOpeningRepository(options: RepositoryPoolOptions) {
  const { pool, close } = repositoryPool(options)
  return {
    close,
    async importBatch(input: { organizationId: string; batch: unknown; commit?: boolean }) {
      const batch = parseProductionOpeningBatch(input.batch)
      const digest = createHash("sha256").update(JSON.stringify(batch)).digest("hex")
      return withTransaction(pool, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('cnc.opening'), hashtext($1))", [input.organizationId])
        const existing = await client.query<{ source_digest: string }>(
          "SELECT source_digest FROM manufacturing.production_opening_batches WHERE organization_id = $1", [input.organizationId])
        if (existing.rows[0]) {
          if (existing.rows[0].source_digest !== digest) throw new Error("CNC opening batch already imported with different contents. Reconcile before changing balances.")
          return { status: "already_imported", cutoffAt: batch.cutoffAt, rows: batch.rows }
        }
        // Serialize with normal writers while validating and installing a baseline.
        // Preview takes the same locks but never writes domain data.
        await client.query(`LOCK TABLE manufacturing.production_entries, manufacturing.production_sessions,
          manufacturing.shop_floor_setup_state, manufacturing.route_selections, manufacturing.setup_completion_events,
          manufacturing.work_orders, manufacturing.route_options, manufacturing.operation_setups, catalog.machines IN SHARE ROW EXCLUSIVE MODE`)
        const resolved = []
        for (const row of batch.rows) {
          const context = await client.query<{ work_order_id: string; route_id: string; setup_id: string; ordered_quantity: string }>(`
            SELECT wo.id AS work_order_id, route.id AS route_id, setup.id AS setup_id, wo.ordered_quantity
            FROM manufacturing.work_orders wo
            JOIN catalog.items item ON item.id = wo.item_id
            JOIN manufacturing.route_selections selection ON selection.work_order_id = wo.id AND selection.reversed_at IS NULL
              AND selection.id = (SELECT id FROM manufacturing.route_selections WHERE work_order_id = wo.id AND reversed_at IS NULL ORDER BY selected_at DESC LIMIT 1)
            JOIN manufacturing.route_options route ON route.id = selection.route_option_id AND route.item_id = item.id AND route.active
            JOIN manufacturing.production_floors floor ON floor.id = route.production_floor_id AND floor.code = 'cnc'
            JOIN manufacturing.operation_setups setup ON setup.route_option_id = route.id AND setup.active
            WHERE wo.organization_id = $1 AND lower(wo.job_card_number) = lower($2)
              AND lower(item.uid) = lower($3) AND lower(route.route_code) = lower($4) AND setup.setup_number = $5`,
          [input.organizationId, row.jobCardNumber, row.partCode, row.optionNumber, row.setupNumber])
          const target = context.rows[0]
          if (!target || context.rows.length !== 1) throw new Error(`Missing or mismatched CNC job, selected route or setup: ${row.jobCardNumber}/${row.setupNumber}.`)
          let machineId: string | null = null
          if (row.machineNumber) {
            const machine = await client.query<{ id: string }>(`
              SELECT machine.id FROM catalog.machines machine
              JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
              WHERE machine.organization_id = $1 AND lower(machine.machine_number) = lower($2) AND machine.active AND floor.code = 'cnc'`,
            [input.organizationId, row.machineNumber])
            machineId = machine.rows[0]?.id ?? null
            if (!machineId) throw new Error(`Active CNC machine not found: ${row.machineNumber}.`)
          }
          const conflict = await client.query<{ present: boolean }>(`SELECT
            EXISTS (SELECT 1 FROM manufacturing.production_entries WHERE work_order_id = $1 AND (operation_setup_id = $2 OR operation_setup_id IS NULL) AND reversed_at IS NULL)
            OR EXISTS (SELECT 1 FROM manufacturing.production_sessions WHERE work_order_id = $1 AND operation_setup_id = $2 AND reversed_at IS NULL)
            OR EXISTS (SELECT 1 FROM manufacturing.shop_floor_setup_state WHERE (work_order_id = $1 AND operation_setup_id = $2) OR (machine_id = $3 AND active))
            OR EXISTS (SELECT 1 FROM manufacturing.setup_completion_events WHERE work_order_id = $1 AND operation_setup_id = $2 AND reversed_at IS NULL)
            AS present`, [target.work_order_id, target.setup_id, machineId])
          if (conflict.rows[0]?.present) throw new Error(`Existing production or workflow must be reconciled: ${row.jobCardNumber}/${row.setupNumber}.`)
          resolved.push({ row, target, machineId })
        }
        const preview = resolved.map(({ row, target }) => ({ ...row, pendingGoodPieces: Math.max(Number(target.ordered_quantity) - row.goodPieces, 0) }))
        if (!input.commit) return { status: "preview", cutoffAt: batch.cutoffAt, rows: preview }
        const savedBatch = await client.query<{ id: string }>(`INSERT INTO manufacturing.production_opening_batches
          (organization_id, cutoff_at, source_digest) VALUES ($1, $2, $3) RETURNING id`, [input.organizationId, batch.cutoffAt, digest])
        for (const { row, target, machineId } of resolved) {
          const sourceId = randomUUID()
          const payload = { ...row, cutoffAt: batch.cutoffAt, productionFloorCode: "cnc", jcNo: row.jobCardNumber,
            setupNo: String(row.setupNumber), machine: row.machineNumber ?? "", openingBalance: true }
          await client.query(`INSERT INTO manufacturing.production_opening_balances
            (batch_id, organization_id, work_order_id, route_option_id, operation_setup_id, machine_id, quantity_good, quantity_rejected, status, source_id, source_payload)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [savedBatch.rows[0]!.id, input.organizationId, target.work_order_id, target.route_id, target.setup_id, machineId, row.goodPieces, row.rejectedPieces, row.status, sourceId, payload])
          const stage = row.status === "running" ? "operator_started" : "item_complete"
          const statePayload = { ...payload, stage, operationSetupCode: String(row.setupNumber), remark: "CNC opening state at cutoff; historical workflow not recorded" }
          const state = await client.query<{ id: string }>(`INSERT INTO manufacturing.shop_floor_setup_state
            (organization_id, work_order_id, route_option_id, operation_setup_id, machine_id, stage, active, source_system, source_table, source_id, source_payload)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'mrm-dashboard','cnc_opening',$8,$9) RETURNING id`,
          [input.organizationId, target.work_order_id, target.route_id, target.setup_id, machineId, stage, row.status === "running", sourceId, statePayload])
          await client.query(`INSERT INTO manufacturing.shop_floor_stage_events
            (organization_id, setup_state_id, to_stage, machine_id, occurred_at, reason, source_system, source_table, source_id, source_payload)
            VALUES ($1,$2,$3,$4,$5,'Opening state at cutoff; not historical approval','mrm-dashboard','cnc_opening',$6,$7)`,
          [input.organizationId, state.rows[0]!.id, stage, machineId, batch.cutoffAt, sourceId, statePayload])
        }
        await queueDashboardRefresh(client, input.organizationId)
        return { status: "imported", cutoffAt: batch.cutoffAt, rows: preview }
      })
    },
  }
}
