import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createDashboardPlanningRepository } from "./dashboard-planning"
import { readCanonicalDashboardSource } from "./dashboard-read-model"
import { readDirectDashboardFacts } from "./dashboard-direct-facts"
import { createDashboardReadModelRepository } from "./dashboard-read-model-repository"
import { migrateDatabase } from "./migrate"
import { createProductionShopFloorRepository } from "./production-shop-floor"
import { buildLegacyDashboardSnapshot } from "./legacy-dashboard-analysis"
import { createQualityRepository } from "./quality"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const repository = createDashboardPlanningRepository({ connectionString })
const jobCards = createProductionShopFloorRepository({ connectionString })
const dashboard = createDashboardReadModelRepository({ connectionString })
let organizationId: string
let itemId: string
const suffix = randomUUID().slice(0, 8)
const itemUid = `PLAN-${suffix}`
const firstJobCard = `JC-${suffix}-1`
const secondJobCard = `JC-${suffix}-2`
const firstMachine = `MC-${suffix}-1`
const secondMachine = `MC-${suffix}-2`
const toolingAssetCode = `NC${Date.now()}`
const toolingItemUid = `TOOLING-ITEM-${suffix}`

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ('MRMPL', 'MRM Private Limited')
      ON CONFLICT (lower(code)) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `
  )
  organizationId = organization.rows[0]!.id
  await pool.query(
    `
      INSERT INTO manufacturing.production_floors (
        organization_id, code, name
      ) VALUES
        ($1, 'conventional', 'Conventional Production Floor'),
        ($1, 'cnc', 'CNC Production Floor')
      ON CONFLICT (organization_id, code) DO NOTHING
    `,
    [organizationId]
  )
  const item = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        item_type, source_system, source_table, source_id
      )
      VALUES ($1, $2, 'INTERNAL', 'M', $2, 'List', 'test', 'items', $3)
      RETURNING id
    `,
    [organizationId, itemUid, randomUUID()]
  )
  itemId = item.rows[0]!.id
  const category = await pool.query<{ id: string }>(
    `INSERT INTO store.asset_categories (organization_id, name)
     VALUES ($1, $2) RETURNING id`,
    [organizationId, `Planning Tooling ${suffix}`]
  )
  const subcategory = await pool.query<{ id: string }>(
    `INSERT INTO store.asset_subcategories (
       organization_id, category_id, name
     ) VALUES ($1, $2, $3) RETURNING id`,
    [organizationId, category.rows[0]!.id, `Tooling ${suffix}`]
  )
  const assetName = await pool.query<{ id: string }>(
    `INSERT INTO store.asset_names (organization_id, subcategory_id, name)
     VALUES ($1, $2, $3) RETURNING id`,
    [organizationId, subcategory.rows[0]!.id, `Cutting Tool ${suffix}`]
  )
  const makeModel = await pool.query<{ id: string }>(
    `INSERT INTO store.make_models (organization_id, name)
     VALUES ($1, $2) RETURNING id`,
    [organizationId, `Planning Model ${suffix}`]
  )
  await pool.query(
    `INSERT INTO store.item_types (
       organization_id, type_code, asset_type, asset_category,
       asset_subcategory, asset_name, identification_name, tracking_mode,
       unit, asset_category_id, asset_subcategory_id, asset_name_id,
       make_model_id
     ) VALUES ($1, $2, 'NON_CONSUMABLE', $3, $4, $5, $6, 'SERIALIZED',
       'Nos', $7, $8, $9, $10)`,
    [
      organizationId,
      toolingAssetCode,
      `Planning Tooling ${suffix}`,
      `Tooling ${suffix}`,
      `Cutting Tool ${suffix}`,
      `Planning Cutting Tool ${suffix}`,
      category.rows[0]!.id,
      subcategory.rows[0]!.id,
      assetName.rows[0]!.id,
      makeModel.rows[0]!.id,
    ]
  )
})

afterAll(async () => {
  await dashboard.close()
  await jobCards.close()
  await repository.close()
  await pool.end()
})

describe("dashboard planning writes", () => {
  test("records FG rejection as a remake without rework and requires fresh RM", async () => {
    const organizationId = (await pool.query<{ id: string }>("INSERT INTO core.organizations (code, name) VALUES ($1, 'Remake Test') RETURNING id", [`REMAKE-${suffix}`])).rows[0]!.id
    await pool.query("INSERT INTO manufacturing.production_floors (organization_id, code, name) VALUES ($1, 'cnc', 'CNC-01')", [organizationId])
    const original = `JC-REMAKE-${suffix}`
    const parent = await repository.upsertWorkOrder({ organizationId, itemUid,
      jobCardNumber: original, workOrderNumber: original, orderedQuantity: 10,
      sourcePayload: { jcNo: original, partCode: itemUid, orderPcs: 10, rmPoNo: `RM-${suffix}`, productionFloorCode: "cnc" } })
    const factsInput = { organizationId, productionFloorCode: "cnc" as const, entryTypes: ["work_order"],
      identity: ["fg_rejected"], dispatchedJobCards: true }
    const undispatched = await dashboard.scopedFactsState(factsInput)
    await pool.query(`INSERT INTO manufacturing.dispatch_approval_events (organization_id, work_order_id,
      decision, quantity, source_system, source_table, source_id, source_payload)
      VALUES ($1, $2, 'approved', 10, 'test', 'dispatchApprovals', $3, $4)`,
      [organizationId, parent.id, randomUUID(), { jcNo: original, quantity: 10, productionFloorCode: "cnc" }])
    expect(await dashboard.scopedFactsState({ ...factsInput, knownSourceRevision: undispatched.sourceRevision,
      knownVersion: undispatched.version })).toMatchObject({ notModified: false,
      dashboard: { productionControl: { workOrders: [expect.objectContaining({ jcNo: original, dispatchedPieces: 10 })] } } })
    await jobCards.upsertRawMaterialReceipt({ organizationId, quantityKg: 10, receivedOn: "2026-10-01",
      receiptNumber: `ORIGINAL-REMAKE-RM-${suffix}`, payload: { jcNo: original, productionFloorCode: "cnc" } })
    const receipt = { organizationId, productionFloorCode: "cnc" as const, originalJobCardNumber: original,
      quantity: 4, receiptType: "fg_rejected" as const, replacementRmPoNo: `NEW-RM-${suffix}`,
      receivedOn: "2026-10-02", reason: "Cannot be reworked; remake from fresh material" }
    await expect(repository.receiveRework(receipt)).rejects.toThrow("Enter positive Required RM (kg)")
    const saved = await repository.receiveRework({ ...receipt, replacementRequiredRmKg: 2 })
    expect(saved.activities).toEqual([expect.objectContaining({ disposition: "replacement", quantity: 4,
      jobCardNumber: `${original} · Rev 1 · Replacement` })])
    const replacement = saved.activities[0]!
    const read = () => jobCards.readJobCardWorkspace({ organizationId, productionFloorCode: "cnc",
      jobCardNumber: original, revisionReference: replacement.jobCardNumber })
    const waiting = await read()
    expect(waiting.revisions.map(row => row.disposition)).toEqual(["original", "replacement"])
    expect(waiting.jobCard).toMatchObject({ workOrderSource: {
      isRework: false, receiptType: "fg_rejected", requiredRmKg: 2, rmPoNo: `NEW-RM-${suffix}`,
    } })
    expect((await pool.query(`SELECT event_type, source_table FROM audit.events
      WHERE target_id = $1 AND event_type = 'production.fg.rejected'`, [replacement.id])).rows)
      .toEqual([{ event_type: "production.fg.rejected", source_table: "fg_rejected" }])
    expect(waiting.rawMaterialReceipts).toEqual([])
    expect(waiting.analytics.material).toMatchObject({ requiredKg: 2, receivedKg: 0, receiptSufficient: false })
    await jobCards.upsertRawMaterialReceipt({ organizationId, quantityKg: 2, receivedOn: "2026-10-03",
      receiptNumber: `FRESH-REMAKE-RM-${suffix}`, payload: { jcNo: replacement.jobCardNumber, productionFloorCode: "cnc" } })
    expect((await read()).analytics.material).toMatchObject({ requiredKg: 2, receivedKg: 2, receiptSufficient: true })
  })

  test("keeps mixed return revision activities, new RM and original history separate", async () => {
    const organizationId = (await pool.query<{ id: string }>("INSERT INTO core.organizations (code, name) VALUES ($1, 'Rework Test') RETURNING id", [`REWORK-${suffix}`])).rows[0]!.id
    await pool.query("INSERT INTO manufacturing.production_floors (organization_id, code, name) VALUES ($1, 'cnc', 'CNC-01')", [organizationId])
    const part = `REWORK-${suffix}`
    const original = `JC-REWORK-${suffix}`
    const parent = await repository.upsertWorkOrder({ organizationId, itemUid: part,
      jobCardNumber: original, workOrderNumber: original, orderedQuantity: 200,
      sourcePayload: { jcNo: original, partCode: part, orderPcs: 200, rmPoNo: `RM-${suffix}`, productionFloorCode: "cnc" } })
    await repository.upsertRouteOption({ organizationId, itemUid: part, productionFloorCode: "cnc",
      routeCode: "1", sourcePayload: { partNo: part, optionNumber: "1", setupNo: "1", setupName: "TURN", machineType: "CNC", machineFamily: "HX" },
      setups: [{ setupNumber: 1, sequence: 1, operationCode: "TURN" }] })
    await pool.query(`INSERT INTO manufacturing.dispatch_approval_events (organization_id, work_order_id,
      decision, quantity, source_system, source_table, source_id) VALUES ($1, $2, 'approved', 100, 'test', 'dispatchApprovals', $3)`,
      [organizationId, parent.id, randomUUID()])
    const before = (await pool.query("SELECT to_jsonb(work_order) AS row FROM manufacturing.work_orders work_order WHERE id = $1", [parent.id])).rows
    const receipt = { organizationId, productionFloorCode: "cnc" as const, originalJobCardNumber: original,
      quantity: 20, replacementQuantity: 8, replacementRequiredRmKg: 2,
      receivedOn: "2026-10-01", reason: "Finish correction" }
    const saved = await repository.receiveRework(receipt)
    const rework = saved.activities.find(row => row.disposition === "rework")!
    const replacement = saved.activities.find(row => row.disposition === "replacement")!
    expect(saved).toMatchObject({ rootJobCardNumber: original, revisionNumber: 1, receiptReference: `RET-${original}-R1` })
    const references = await pool.query("SELECT source_payload->>'receiptReference' AS reference FROM manufacturing.work_orders WHERE id = ANY($1::uuid[])", [saved.activities.map(row => row.id)])
    expect(references.rows.map(row => row.reference)).toEqual([saved.receiptReference, saved.receiptReference])
    expect(rework.jobCardNumber).toBe(`${original} · Rev 1 · Rework`)
    const read = (revisionReference = rework.jobCardNumber) => jobCards.readJobCardWorkspace({ organizationId, productionFloorCode: "cnc", jobCardNumber: original, revisionReference })
    const waiting = await read()
    expect(waiting.revisions.map(row => [row.revisionLabel, row.quantity])).toEqual([["Original", 200], ["Rev 1 · Replacement", 8], ["Rev 1 · Rework", 12]])
    expect(waiting.jobCard.effectiveRouteSource).toBe("planner_required")
    expect(waiting.setups).toEqual([])
    await repository.selectRoute({ organizationId, productionFloorCode: "cnc", jobCardNumber: rework.jobCardNumber, routeCode: "1" })
    expect((await read()).jobCard).toMatchObject({ effectiveRouteSource: "planner_selected" })
    expect((await read()).setups).toHaveLength(1)
    await jobCards.upsertRawMaterialReceipt({ organizationId, quantityKg: 100, receivedOn: "2026-10-01",
      receiptNumber: `OLD-RM-${suffix}`, payload: { jcNo: original, productionFloorCode: "cnc" } })
    const fresh = await read(replacement.jobCardNumber)
    expect(fresh.rawMaterialReceipts).toEqual([])
    expect(fresh.analytics.material).toMatchObject({ requiredKg: 2, receivedKg: 0, receiptSufficient: false })
    await jobCards.upsertRawMaterialReceipt({ organizationId, quantityKg: 2, receivedOn: "2026-10-02",
      receiptNumber: `NEW-RM-${suffix}`, payload: { jcNo: replacement.jobCardNumber, productionFloorCode: "cnc" } })
    expect((await read(replacement.jobCardNumber)).analytics.material).toMatchObject({ requiredKg: 2, receivedKg: 2, receiptSufficient: true })
    expect((await read()).rawMaterialReceipts).toEqual([])
    const history = await read("all")
    expect(history.revisionHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ revisionLabel: "Original", eventType: "raw_material_received" }),
      expect.objectContaining({ revisionLabel: "Rev 1 · Replacement", eventType: "raw_material_received" }),
      expect.objectContaining({ eventType: "return_received", detail: `${saved.receiptReference} · ${receipt.reason}` }),
    ]))
    await pool.query(`INSERT INTO manufacturing.dispatch_approval_events (organization_id, work_order_id,
      decision, quantity, source_system, source_table, source_id) VALUES ($1, $2, 'approved', 12, 'test', 'dispatchApprovals', $3)`,
      [organizationId, rework.id, randomUUID()])
    const repeated = await repository.receiveRework({ ...receipt, originalJobCardNumber: rework.jobCardNumber,
      quantity: 1, replacementQuantity: 0 })
    expect(repeated).toMatchObject({ rootJobCardNumber: original, revisionNumber: 2, receiptReference: `RET-${original}-R2` })
    await expect(repository.receiveRework({ ...receipt, quantity: 86 })).rejects.toThrow("Only 85 pieces remain available to return, including the 5%")
    const atLimit = await repository.receiveRework({ ...receipt, quantity: 85, replacementQuantity: 0 })
    expect(atLimit).toMatchObject({ revisionNumber: 3, receiptReference: `RET-${original}-R3`, activities: [expect.objectContaining({ quantity: 85 })] })
    const failed = atLimit.activities[0]!
    await repository.upsertMachine({ organizationId, machineNumber: `RW-MC-${suffix}`, productionFloorCode: "cnc",
      sourcePayload: { machineFamily: "HX", machineType: "CNC" } })
    const quality = createQualityRepository({ pool })
    const diameter = `Rework diameter ${suffix}`
    const thread = `Rework thread ${suffix}`
    const micrometer = `Rework micrometer ${suffix}`
    for (const name of [diameter, thread]) await quality.upsertQualityReference({ organizationId, kind: "parameter_master", name, active: true, payload: {} })
    await quality.upsertQualityReference({ organizationId, kind: "measuring_instrument_master", name: micrometer, active: true, payload: {} })
    const routeInput = { organizationId, productionFloorCode: "cnc" as const, jobCardNumber: failed.jobCardNumber,
      setups: [{ setupName: "Thread correction", machineFamily: "HX", cycleTimeSeconds: 30, setupTimeMinutes: 10,
        stageWeight: 5, inspectionChecks: [
          { parameterName: diameter, specification: "10", instrumentUsed: micrometer, tolerancePlus: "0.2", toleranceMinus: "0.1", inputType: "number" },
          { parameterName: thread, specification: "Thread gauge passes freely", inputType: "pass_fail" },
        ] }] }
    const privateRoute = await repository.createReworkRoute(routeInput)
    const custom = await read(failed.jobCardNumber)
    expect(custom.jobCard.effectiveRouteSource).toBe("planner_selected")
    expect(custom.setups).toEqual([expect.objectContaining({ operationName: "Thread correction", cycleTimeSeconds: "30.00000000",
      qualityParameters: [expect.objectContaining({ name: diameter }), expect.objectContaining({ name: thread })] })])
    const parameters = await pool.query(`SELECT name, data_type, nominal_value::float8 AS nominal,
      lower_limit::float8 AS lower, upper_limit::float8 AS upper,
      source_payload->>'specification' AS specification, source_payload->>'instrumentUsed' AS instrument,
      source_payload->>'tolerancePlus' AS plus, source_payload->>'toleranceMinus' AS minus
      FROM quality.parameter_definitions WHERE route_option_id = $1 ORDER BY sequence`, [privateRoute.routeId])
    expect(parameters.rows).toEqual([
      { name: diameter, data_type: "numeric", nominal: 10, lower: 9.9, upper: 10.2, specification: "10", instrument: micrometer, plus: "0.2", minus: "0.1" },
      { name: thread, data_type: "boolean", nominal: null, lower: null, upper: null, specification: "Thread gauge passes freely", instrument: "", plus: null, minus: null },
    ])
    expect((await read(original)).routes).not.toContainEqual(expect.objectContaining({ id: privateRoute.routeId }))
    const source = await readCanonicalDashboardSource(pool, organizationId)
    const control = buildLegacyDashboardSnapshot({ workbookName: "PostgreSQL", productionFloorCode: "cnc",
      dataEntries: source.allDataEntries, productionEntries: [], routeSelections: source.routeSelections }).productionControl
    expect(control).toMatchObject({ routeMasterRows: [expect.objectContaining({ optionNumber: "1" })],
      cycleMasterRows: [], toolingMasterRows: [], qualityParameterMasterRows: [],
      jobReworkRouteRows: [expect.objectContaining({ reworkJobCardNumber: failed.jobCardNumber })],
      jobReworkInspectionRows: expect.arrayContaining([expect.objectContaining({ parameterName: diameter, specification: "10", instrumentUsed: micrometer }), expect.objectContaining({ parameterName: thread })]) })
    await expect(repository.selectRoute({ organizationId, productionFloorCode: "cnc", jobCardNumber: rework.jobCardNumber, routeCode: privateRoute.routeCode })).rejects.toThrow("Route option was not found")
    const setupId = String(custom.setups[0]!.id)
    await jobCards.recordShopFloorStage({ organizationId, productionFloorCode: "cnc", jobCardNumber: failed.jobCardNumber,
      machineNumber: `RW-MC-${suffix}`, operationSetupCode: "1", stage: "raw_material_at_machine",
      payload: { jcNo: failed.jobCardNumber, partCode: part, optionNumber: privateRoute.routeCode, setupNo: "1", machine: `RW-MC-${suffix}` } })
    const release = (await jobCards.readReleasableSetups({ organizationId, productionFloorCode: "cnc" }))
      .rows.find(row => row.jobCardNumber === failed.jobCardNumber)!
    expect(release.releaseBlockedReason).toContain("first rework setup")
    await expect(jobCards.releaseSetupAwaitingMaterial({ organizationId, productionFloorCode: "cnc", setupStateId: release.id,
      expectedRowVersion: Number(release.rowVersion), reason: "Cannot wait for fresh RM on returned pieces" })).rejects.toThrow("first rework setup")
    expect((await jobCards.readReleasableSetups({ organizationId, productionFloorCode: "cnc" }))
      .rows.some(row => row.id === release.id)).toBe(true)
    await pool.query(`INSERT INTO manufacturing.production_entries (organization_id, work_order_id, operation_setup_id,
      route_option_id, production_date, quantity_good, quantity_rejected, source_system, source_table, source_id)
      VALUES ($1,$2,$3,$4,'2026-10-02',0,2,'test','productionEntries',$5)`, [organizationId, failed.id, setupId, privateRoute.routeId, randomUUID()])
    await expect(repository.createReworkRoute(routeInput)).rejects.toThrow("after execution starts")
    const remade = await repository.rejectRework({ organizationId, productionFloorCode: "cnc", jobCardNumber: failed.jobCardNumber,
      quantity: 85, rejectedOn: "2026-10-02", reason: "Thread cannot be recovered", replacementRequiredRmKg: 1 })
    expect(remade).toMatchObject({ revisionNumber: 4, receiptReference: atLimit.receiptReference })
    const rejected = await read(failed.jobCardNumber)
    expect(rejected.jobCard).toMatchObject({ status: "Rejected", workOrderSource: { trialRejectedQuantity: 2, additionalBatchRejectedQuantity: 83 } })
    expect(rejected.setups).toHaveLength(1)
    const remake = await read(remade.replacementJobCardNumber)
    expect(remake.jobCard.effectiveRouteSource).toBe("planner_required")
    expect(remake.rawMaterialReceipts).toEqual([])
    expect(remake.analytics.material).toMatchObject({ requiredKg: 1, receivedKg: 0, receiptSufficient: false })
    expect((await read("all")).revisionHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: "rework_rejected", quantity: 85 }),
      expect.objectContaining({ eventType: "replacement_created", revisionReference: remade.replacementJobCardNumber }),
    ]))
    await expect(repository.rejectRework({ organizationId, productionFloorCode: "cnc", jobCardNumber: failed.jobCardNumber,
      quantity: 85, rejectedOn: "2026-10-02", reason: "Duplicate", replacementRequiredRmKg: 1 })).rejects.toThrow("already closed")
    expect((await pool.query("SELECT to_jsonb(work_order) AS row FROM manufacturing.work_orders work_order WHERE id = $1", [parent.id])).rows).toEqual(before)
    await pool.query(`INSERT INTO manufacturing.dispatch_approval_events (organization_id, work_order_id,
      decision, source_system, source_table, source_id) VALUES ($1, $2, 'approved', 'test', 'dispatchApprovals', $3)`,
      [organizationId, parent.id, randomUUID()])
    await expect(repository.receiveRework({ ...receipt, quantity: 1, replacementQuantity: 0 })).rejects.toThrow("Record the actual dispatched quantity")
  })

  test("updates only Required RM on existing unit orders without queuing planning", async () => {
    const jobCardNumber = `JC-REQUIRED-RM-${suffix}`
    const otherUnitJobCard = `${jobCardNumber}-OTHER`
    await pool.query(
      `INSERT INTO manufacturing.work_orders (
         organization_id, work_order_number, job_card_number, item_id,
         ordered_quantity, completed_quantity, due_date, status,
         source_system, source_table, source_id, source_payload
       ) VALUES ($1, $2, $2, $3, 5000, 1000, '2026-11-01', 'Cancelled',
         'test', 'work_order', $2, $4),
         ($1, $5, $5, $3, 2000, 0, '2026-12-01', 'Open',
         'test', 'work_order', $5, '{"productionFloorCode":"cnc","requiredRmKg":20}')`,
      [organizationId, jobCardNumber, itemId, {
        productionFloorCode: "conventional-02", requiredRmKg: 10,
        selectedRouteCode: "ROUTE-A", rmShortAccepted: true, orderKg: 50,
      }, otherUnitJobCard]
    )
    try {
      const business = () => pool.query(`SELECT
        to_jsonb(work_order) - ARRAY['source_payload', 'updated_at', 'updated_by_user_id', 'row_version'] AS order_fields,
        source_payload - 'requiredRmKg' AS payload
        FROM manufacturing.work_orders work_order WHERE organization_id = $1 ORDER BY id`, [organizationId])
      const planning = () => pool.query(`SELECT 'refresh' AS kind, to_jsonb(job) AS state
        FROM derived.refresh_jobs job WHERE organization_id = $1
        UNION ALL SELECT 'outbox', to_jsonb(event) FROM derived.outbox_events event
        WHERE organization_id = $1 ORDER BY kind, state`, [organizationId])
      const beforeBusiness = (await business()).rows
      const beforePlanning = (await planning()).rows
      const row = { jobCardNumber: jobCardNumber.toLowerCase(), requiredRmKg: 12.5 }
      const input = {
        organizationId, productionFloorCode: "conventional-02" as const,
        rows: [row, row, { jobCardNumber: otherUnitJobCard, requiredRmKg: 99 },
          { jobCardNumber: `${jobCardNumber}-MISSING`, requiredRmKg: 99 }],
      }
      expect(await repository.updateWorkOrderRequiredRm(input)).toEqual({ updated: 1, unchanged: 0, skipped: 2 })
      const afterFirst = await pool.query(`SELECT to_jsonb(work_order) AS state
        FROM manufacturing.work_orders work_order WHERE organization_id = $1 ORDER BY id`, [organizationId])
      expect(await repository.updateWorkOrderRequiredRm(input)).toEqual({ updated: 0, unchanged: 1, skipped: 2 })
      expect((await pool.query(`SELECT to_jsonb(work_order) AS state
        FROM manufacturing.work_orders work_order WHERE organization_id = $1 ORDER BY id`, [organizationId])).rows).toEqual(afterFirst.rows)
      expect((await business()).rows).toEqual(beforeBusiness)
      expect((await planning()).rows).toEqual(beforePlanning)
      const requiredRm = await pool.query(`SELECT job_card_number, source_payload->'requiredRmKg' AS kg
        FROM manufacturing.work_orders WHERE organization_id = $1 AND job_card_number = ANY($2::text[])
        ORDER BY job_card_number`, [organizationId, [jobCardNumber, otherUnitJobCard]])
      expect(requiredRm.rows).toEqual([
        { job_card_number: jobCardNumber, kg: 12.5 },
        { job_card_number: otherUnitJobCard, kg: 20 },
      ])
      const audit = await pool.query(`SELECT before_state->'source_payload'->'requiredRmKg' AS before,
        after_state->'source_payload'->'requiredRmKg' AS after FROM audit.events
        WHERE event_type = 'manufacturing.work_order.required_rm_updated' AND target_id = (
          SELECT id FROM manufacturing.work_orders WHERE organization_id = $1 AND job_card_number = $2)`,
        [organizationId, jobCardNumber])
      expect(audit.rows).toEqual([{ before: 10, after: 12.5 }])
    } finally {
      await pool.query(`WITH removed_audit AS (DELETE FROM audit.events WHERE target_id IN (
        SELECT id FROM manufacturing.work_orders WHERE organization_id = $1 AND job_card_number = ANY($2::text[])))
        DELETE FROM manufacturing.work_orders WHERE organization_id = $1 AND job_card_number = ANY($2::text[])`,
        [organizationId, [jobCardNumber, otherUnitJobCard]])
    }
  })

  test("rejects conflicting Required RM rows atomically and reports unmatched Job Cards", async () => {
    const jobCardNumber = `JC-REQUIRED-RM-CONFLICT-${suffix}`
    await pool.query(`INSERT INTO manufacturing.work_orders (
      organization_id, work_order_number, job_card_number, item_id, ordered_quantity,
      source_system, source_table, source_id, source_payload)
      VALUES ($1, $2, $2, $3, 100, 'test', 'work_order', $2,
        '{"requiredRmKg":10,"productionFloorCode":"cnc"}')`, [organizationId, jobCardNumber, itemId])
    try {
      const snapshot = () => pool.query(`SELECT to_jsonb(work_order) AS state
        FROM manufacturing.work_orders work_order WHERE organization_id = $1 AND job_card_number = $2`,
        [organizationId, jobCardNumber])
      const before = (await snapshot()).rows
      const input = { organizationId, productionFloorCode: "cnc" as const }
      await expect(repository.updateWorkOrderRequiredRm({ ...input, rows: [
        { jobCardNumber, requiredRmKg: 20 },
        { jobCardNumber: jobCardNumber.toLowerCase(), requiredRmKg: 30 },
      ] })).rejects.toThrow(/Conflicting Required RM/)
      await expect(repository.updateWorkOrderRequiredRm({ ...input, rows: [
        { jobCardNumber: `${jobCardNumber}-MISSING`, requiredRmKg: 20 },
      ] })).rejects.toThrow(/No saved Work Orders match/)
      expect((await snapshot()).rows).toEqual(before)
    } finally {
      await pool.query(`WITH removed_audit AS (DELETE FROM audit.events WHERE target_id IN (
        SELECT id FROM manufacturing.work_orders WHERE organization_id = $1 AND job_card_number = $2))
        DELETE FROM manufacturing.work_orders WHERE organization_id = $1 AND job_card_number = $2`,
        [organizationId, jobCardNumber])
    }
  })

  test("cancels an RM-received work order and releases its active setup", async () => {
    const jobCardNumber = `JC-CANCEL-${suffix}`
    const machineNumber = `MC-CANCEL-${suffix}`
    const rmPoNumber = `RM-CANCEL-${suffix}`

    await repository.upsertRouteOption({
      itemUid,
      organizationId,
      productionFloorCode: "cnc",
      routeCode: "CANCEL",
      setups: [{ operationCode: "TURN", sequence: 1, setupNumber: 1 }],
    })
    await repository.upsertWorkOrder({
      itemUid,
      jobCardNumber,
      orderedQuantity: 10_000,
      organizationId,
      requiredProductionFloorCode: "cnc",
      sourcePayload: {
        jcNo: jobCardNumber,
        orderKg: 100,
        requiredRmKg: 100,
        orderPcs: 10_000,
        partCode: itemUid,
        productionFloorCode: "cnc",
        rmPoNo: rmPoNumber,
      },
      workOrderNumber: `WO-CANCEL-${suffix}`,
    })
    await repository.selectRoute({
      jobCardNumber,
      organizationId,
      productionFloorCode: "cnc",
      routeCode: "CANCEL",
    })
    await repository.upsertMachine({
      machineNumber,
      organizationId,
      productionFloorCode: "cnc",
    })
    await jobCards.upsertRawMaterialReceipt({
      organizationId,
      payload: {
        jcNo: jobCardNumber,
        partCode: itemUid,
        productionFloorCode: "cnc",
        rmPoNo: rmPoNumber,
      },
      quantityKg: 100,
      receiptNumber: rmPoNumber,
      receivedOn: "2026-09-21",
      requiredProductionFloorCode: "cnc",
    })

    const ids = await pool.query<{
      machine_id: string
      route_option_id: string
      setup_id: string
      work_order_id: string
    }>(
      `SELECT machine.id AS machine_id, route.id AS route_option_id,
         setup.id AS setup_id, work_order.id AS work_order_id
       FROM manufacturing.work_orders work_order
       JOIN manufacturing.route_options route
         ON route.item_id = work_order.item_id AND route.route_code = 'CANCEL'
       JOIN manufacturing.operation_setups setup
         ON setup.route_option_id = route.id AND setup.setup_number = 1
       CROSS JOIN catalog.machines machine
       WHERE work_order.organization_id = $1
         AND work_order.job_card_number = $2
         AND machine.machine_number = $3`,
      [organizationId, jobCardNumber, machineNumber]
    )
    const idsRow = ids.rows[0]!
    await pool.query(
      `INSERT INTO manufacturing.shop_floor_setup_state (
         organization_id, work_order_id, route_option_id,
         operation_setup_id, machine_id, stage, active,
         source_system, source_table, source_id
       ) VALUES ($1, $2, $3, $4, $5, 'planned', true,
         'test', 'shop_floor_setup_state', $6)`,
      [
        organizationId,
        idsRow.work_order_id,
        idsRow.route_option_id,
        idsRow.setup_id,
        idsRow.machine_id,
        randomUUID(),
      ]
    )

    await expect(repository.cancelWorkOrder({
      jobCardNumber,
      organizationId,
      productionFloorCode: "cnc",
      reason: "Customer cancelled the order line",
    })).resolves.toMatchObject({ jobCardNumber, ok: true })

    const persisted = await pool.query<{
      active: boolean
      audit_count: string
      cancellation_reason: string
      receipt_count: string
      stage_event_count: string
      stage: string
      status: string
    }>(
      `SELECT work_order.status, work_order.cancellation_reason,
         state.active, state.stage,
         (SELECT count(*) FROM manufacturing.raw_material_receipts receipt
          WHERE receipt.work_order_id = work_order.id) AS receipt_count,
         (SELECT count(*) FROM audit.events event
          WHERE event.target_id = work_order.id
            AND event.event_type = 'manufacturing.work_order.cancelled') AS audit_count,
         (SELECT count(*) FROM manufacturing.shop_floor_stage_events event
          WHERE event.setup_state_id = state.id
            AND event.to_stage = 'cancelled') AS stage_event_count
       FROM manufacturing.work_orders work_order
       JOIN manufacturing.shop_floor_setup_state state
         ON state.work_order_id = work_order.id
       WHERE work_order.id = $1`,
      [idsRow.work_order_id]
    )
    expect(persisted.rows[0]).toEqual({
      active: false,
      audit_count: "1",
      cancellation_reason: "Customer cancelled the order line",
      receipt_count: "1",
      stage: "cancelled",
      stage_event_count: "1",
      status: "Cancelled",
    })

    await expect(jobCards.upsertRawMaterialReceipt({
      organizationId,
      payload: {
        jcNo: jobCardNumber,
        partCode: itemUid,
        productionFloorCode: "cnc",
        rmPoNo: rmPoNumber,
      },
      quantityKg: 10,
      receiptNumber: `${rmPoNumber}-2`,
      receivedOn: "2026-09-22",
      requiredProductionFloorCode: "cnc",
    })).rejects.toThrow(`Work Order for Job Card "${jobCardNumber}" is cancelled`)

    await expect(repository.upsertWorkOrder({
      itemUid,
      jobCardNumber,
      orderedQuantity: 12_000,
      organizationId,
      requiredProductionFloorCode: "cnc",
      workOrderNumber: `WO-CANCEL-${suffix}`,
    })).rejects.toThrow("Cancelled Work Order lines cannot be updated")
  })

  test("records raw-material rejection against the usable Job Card balance", async () => {
    const itemUid = `RM-REJECT-ITEM-${suffix}`
    await pool.query(`INSERT INTO catalog.items (
      organization_id, uid, uid_kind, lifecycle_status, description,
      item_type, source_system, source_table, source_id)
      VALUES ($1, $2, 'INTERNAL', 'M', $2, 'List', 'test', 'items', $3)`,
      [organizationId, itemUid, randomUUID()])
    const jobCardNumber = `JC-RM-REJECT-${suffix}`
    const rmPoNumber = `RM-REJECT-${suffix}`
    await repository.upsertWorkOrder({
      itemUid,
      jobCardNumber,
      orderedQuantity: 10_000,
      organizationId,
      requiredProductionFloorCode: "cnc",
      sourcePayload: {
        jcNo: jobCardNumber,
        orderKg: 100,
        requiredRmKg: 100,
        orderPcs: 10_000,
        partCode: itemUid,
        productionFloorCode: "cnc",
        rmPoNo: rmPoNumber,
      },
      workOrderNumber: `WO-RM-REJECT-${suffix}`,
    })
    await jobCards.upsertRawMaterialReceipt({
      organizationId,
      payload: {
        jcNo: jobCardNumber,
        partCode: itemUid,
        productionFloorCode: "cnc",
        rmPoNo: rmPoNumber,
      },
      quantityKg: 100,
      receiptNumber: rmPoNumber,
      receivedOn: "2026-09-21",
      requiredProductionFloorCode: "cnc",
    })

    await expect(repository.recordRawMaterialRejection({
      jobCardNumber,
      organizationId,
      planningAction: "continue_accepted_quantity",
      productionFloorCode: "cnc",
      reason: "Material chemistry rejected",
      rejectedKg: 50,
    })).resolves.toMatchObject({
      planningAction: "continue_accepted_quantity",
      rejectionScope: "partial",
      usableKgAfter: 50,
    })
    expect(await dashboard.rawMaterialInwardTemplateRows(organizationId, "cnc")).toContainEqual(
      expect.objectContaining({ jcNo: jobCardNumber })
    )

    await expect(repository.recordRawMaterialRejection({
      jobCardNumber,
      organizationId,
      planningAction: "wait_for_replacement",
      productionFloorCode: "cnc",
      reason: "Invalid second dispatch",
      rejectedKg: 51,
    })).rejects.toThrow("cannot exceed the usable Raw Material balance")

    const machineNumber = `RM-HOLD-${suffix}`
    await repository.upsertMachine({ machineNumber, organizationId, productionFloorCode: "cnc" })
    await repository.upsertRouteOption({ itemUid, organizationId, productionFloorCode: "cnc",
      routeCode: "RM-HOLD", setups: [{ operationCode: "TURN", sequence: 1, setupNumber: 1 }] })
    await pool.query(`INSERT INTO manufacturing.shop_floor_setup_state (
      organization_id, work_order_id, route_option_id, operation_setup_id,
      machine_id, stage, active, source_system, source_table, source_id)
      SELECT $1, work_order.id, route.id, setup.id, machine.id,
        'operator_started', true, 'test', 'shop_floor_status', $4
      FROM manufacturing.work_orders work_order
      JOIN manufacturing.route_options route ON route.item_id = work_order.item_id AND route.route_code = 'RM-HOLD'
      JOIN manufacturing.operation_setups setup ON setup.route_option_id = route.id
      JOIN catalog.machines machine ON machine.organization_id = work_order.organization_id AND machine.machine_number = $3
      WHERE work_order.organization_id = $1 AND work_order.job_card_number = $2`,
      [organizationId, jobCardNumber, machineNumber, randomUUID()])
    const held = await repository.recordRawMaterialRejection({ jobCardNumber, organizationId,
      planningAction: "wait_for_replacement", productionFloorCode: "cnc", reason: "Wait for sound material", rejectedKg: 10 })
    const state = await pool.query(`SELECT state.active, state.stage, state.completed_at,
      event.source_payload->>'plannerDecisionId' AS decision_id
      FROM manufacturing.shop_floor_setup_state state
      JOIN catalog.machines machine ON machine.id = state.machine_id
      LEFT JOIN manufacturing.shop_floor_stage_events event ON event.setup_state_id = state.id
      WHERE machine.machine_number = $1`, [machineNumber])
    expect(state.rows).toEqual([expect.objectContaining({ active: false, stage: "planned",
      completed_at: null, decision_id: held.id })])
  })

  test("reviews a machine issue in its unit and preserves the original decision", async () => {
    const machineNumber = `REVIEW-${suffix}`
    await repository.upsertMachine({ machineNumber, organizationId, productionFloorCode: "cnc" })
    const issue = await repository.recordMachineConstraint({
      machineNumber, organizationId, productionFloorCode: "cnc",
      reason: "Breakdown", unavailableFrom: "2026-01-01", rescheduleAction: "delay",
    })
    const input = { organizationId, constraintId: issue.id, productionFloorCode: "cnc" }
    await expect(repository.reviewMachineConstraint({ ...input, productionFloorCode: "conventional", action: "available" }))
      .rejects.toThrow("another Production Unit")
    await repository.reviewMachineConstraint({ ...input, action: "extend", unavailableTo: "2099-01-01" })
    await repository.reviewMachineConstraint({ ...input, action: "available" })
    const saved = await pool.query<{ source_payload: Record<string, unknown>; reversed_at: string | null }>(
      `SELECT source_payload, reversed_at FROM manufacturing.machine_constraint_events WHERE id=$1`, [issue.id])
    expect(saved.rows[0]?.reversed_at).toBeNull()
    expect(saved.rows[0]?.source_payload).toMatchObject({
      status: "Available", unavailableFrom: "2026-01-01", unavailableTo: "2099-01-01",
      rescheduleAction: "delay", availableOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      availabilityReviews: [expect.objectContaining({ action: "extend" }), expect.objectContaining({ action: "available" })],
    })
    await expect(repository.reviewMachineConstraint({ ...input, action: "available" })).rejects.toThrow("already closed")
  })

  test("references only existing Store Asset Codes in Tooling Master", async () => {
    const routeCode = `TOOLING-${suffix}`
    await repository.upsertRouteOption({
      itemUid: toolingItemUid,
      organizationId,
      routeCode,
      setups: [{ operationCode: "TOOL", sequence: 1, setupNumber: 1 }],
    })

    await expect(
      repository.upsertTooling({
        itemUid: toolingItemUid,
        organizationId,
        routeCode,
        setupNumber: 1,
        toolCode: `MISSING-${suffix}`,
      })
    ).rejects.toThrow("Create the tooling Asset Code in Store first")

    await expect(
      repository.upsertTooling({
        itemUid: toolingItemUid,
        organizationId,
        routeCode,
        setupNumber: 1,
        toolCode: toolingAssetCode,
      })
    ).resolves.toEqual({ id: expect.any(String) })
  })

  test("creates a missing recognized production floor for a machine import", async () => {
    const machineNumber = `FLOOR-${suffix}`
    await pool.query(
      `
        DELETE FROM manufacturing.production_floors
        WHERE organization_id = $1 AND code = 'conventional-02'
      `,
      [organizationId]
    )

    await repository.upsertMachine({
      machineNumber,
      organizationId,
      productionFloorCode: "conventional-02",
    })

    const floor = await pool.query<{ code: string; name: string }>(
      `
        SELECT floor.code, floor.name
        FROM catalog.machines machine
        JOIN manufacturing.production_floors floor
          ON floor.id = machine.production_floor_id
        WHERE machine.organization_id = $1
          AND machine.machine_number = $2
      `,
      [organizationId, machineNumber]
    )

    expect(floor.rows).toEqual([
      {
        code: "conventional-02",
        name: "PPAC Conventional-02",
      },
    ])
  })

  test("creates a planning item when its first Route Master is imported", async () => {
    const newItemUid = `ROUTE-${suffix}`

    await repository.upsertRouteOption({
      itemUid: newItemUid,
      organizationId,
      routeCode: "1",
      setups: [{ operationCode: "SETUP-1", sequence: 1, setupNumber: 1 }],
    })

    const item = await pool.query<{
      source_system: string
      source_table: string
      uid: string
    }>(
      `
        SELECT uid, source_system, source_table
        FROM catalog.items
        WHERE organization_id = $1 AND lower(uid) = lower($2)
      `,
      [organizationId, newItemUid]
    )

    expect(item.rows).toEqual([
      {
        source_system: "mrm-dashboard",
        source_table: "route_master",
        uid: newItemUid,
      },
    ])
  })

  test("accepts a work order before its planning item and releases the readiness hold after Route Master", async () => {
    const pendingItemUid = `PENDING-${suffix}`
    const pendingJobCard = `JC-PENDING-${suffix}`

    const workOrder = await repository.upsertWorkOrder({
      itemUid: pendingItemUid,
      jobCardNumber: pendingJobCard,
      orderedQuantity: 25,
      organizationId,
      sourcePayload: {
        jcNo: pendingJobCard,
        orderPcs: 25,
        partCode: pendingItemUid,
      },
      workOrderNumber: `WO-PENDING-${suffix}`,
    })

    expect(workOrder.planningItemPending).toBe(true)
    const held = await pool.query<{
      item_source_table: string
      planning_item_pending: boolean
    }>(
      `
        SELECT item.source_table AS item_source_table,
          (work_order.source_payload ->> 'planningItemPending')::boolean
            AS planning_item_pending
        FROM manufacturing.work_orders work_order
        JOIN catalog.items item ON item.id = work_order.item_id
        WHERE work_order.organization_id = $1
          AND work_order.job_card_number = $2
      `,
      [organizationId, pendingJobCard]
    )
    expect(held.rows).toEqual([{
      item_source_table: "work_order_readiness",
      planning_item_pending: true,
    }])

    await repository.upsertRouteOption({
      itemUid: pendingItemUid,
      organizationId,
      routeCode: "1",
      setups: [{ operationCode: "SETUP-1", sequence: 1, setupNumber: 1 }],
    })

    const released = await pool.query<{
      item_source_table: string
      planning_item_pending: boolean
    }>(
      `
        SELECT item.source_table AS item_source_table,
          (work_order.source_payload ->> 'planningItemPending')::boolean
            AS planning_item_pending
        FROM manufacturing.work_orders work_order
        JOIN catalog.items item ON item.id = work_order.item_id
        WHERE work_order.organization_id = $1
          AND work_order.job_card_number = $2
      `,
      [organizationId, pendingJobCard]
    )
    expect(released.rows).toEqual([{
      item_source_table: "route_master",
      planning_item_pending: false,
    }])
  })

  test("does not reassign an existing Job Card to another Work Order Line", async () => {
    await repository.upsertWorkOrder({
      itemUid: "ITEM-JC-LOCK-1",
      jobCardNumber: "JC-LOCKED-LINE",
      orderedQuantity: 10,
      organizationId,
      workOrderNumber: "FG-LOCK-1::ITEM-JC-LOCK-1",
    })

    await expect(
      repository.upsertWorkOrder({
        itemUid: "ITEM-JC-LOCK-2",
        jobCardNumber: "JC-LOCKED-LINE",
        orderedQuantity: 10,
        organizationId,
        workOrderNumber: "FG-LOCK-2::ITEM-JC-LOCK-2",
      })
    ).rejects.toThrow(/Job Card already belongs to another FG PO Number and Part Code/i)
  })

  test("keeps separate Job Cards for the same FG PO and part on reimport", async () => {
    const shared = { organizationId, itemUid, workOrderNumber: `118::${itemUid}` }
    const first = await repository.upsertWorkOrder({ ...shared, jobCardNumber: `P1429-${suffix}`, orderedQuantity: 1000 })
    const second = await repository.upsertWorkOrder({ ...shared, jobCardNumber: `P1482-${suffix}`, orderedQuantity: 3700 })
    expect(first.id).not.toBe(second.id)
    const repeated = await repository.upsertWorkOrder({ ...shared, jobCardNumber: `P1429-${suffix}`, orderedQuantity: 1000 })
    expect(repeated.id).toBe(first.id)
    const lines = await pool.query<{ quantity: number }>(
      "SELECT ordered_quantity::float8 AS quantity FROM manufacturing.work_orders WHERE id = ANY($1::uuid[]) ORDER BY ordered_quantity",
      [[first.id, second.id]]
    )
    expect(lines.rows).toEqual([{ quantity: 1000 }, { quantity: 3700 }])
  })

  test("reallocates one central machine record between production floors", async () => {
    const machineNumber = `MOVE-${suffix}`
    const original = await repository.upsertMachine({
      machineNumber,
      name: "Moveable machine",
      organizationId,
      productionFloorCode: "conventional",
      sourcePayload: { machineNo: machineNumber, productionFloorCode: "conventional" },
    })
    const reallocated = await repository.upsertMachine({
      machineNumber,
      name: "Moveable machine",
      organizationId,
      productionFloorCode: "cnc",
      sourcePayload: { machineNo: machineNumber, productionFloorCode: "cnc" },
    })

    const floor = await pool.query<{ code: string }>(
      `
        SELECT floor.code
        FROM catalog.machines machine
        JOIN manufacturing.production_floors floor
          ON floor.id = machine.production_floor_id
        WHERE machine.id = $1
      `,
      [original.id]
    )

    expect(reallocated.id).toBe(original.id)
    expect(floor.rows[0]?.code).toBe("cnc")
  })

  test("edits an existing Machine Master record by its visible source ID", async () => {
    const machineNumber = `DETAIL-${suffix}`
    const original = await repository.upsertMachine({
      machineNumber,
      organizationId,
      productionFloorCode: "cnc",
      rejectDuplicates: true,
      sourcePayload: { machineNo: machineNumber },
    })
    const source = await pool.query<{ source_id: string }>(
      "SELECT source_id FROM catalog.machines WHERE id = $1",
      [original.id]
    )
    const correction = {
      machineNumber,
      organizationId,
      productionFloorCode: "cnc",
      rejectDuplicates: true,
      sourcePayload: { machineNo: machineNumber, machineModelNo: "20-G" },
    }
    const updated = await repository.upsertMachine({
      ...correction,
      recordId: source.rows[0]!.source_id,
    })
    expect(updated.id).toBe(original.id)
    const saved = await pool.query<{ model: string }>(
      "SELECT source_payload->>'machineModelNo' AS model FROM catalog.machines WHERE id = $1",
      [original.id]
    )
    expect(saved.rows[0]?.model).toBe("20-G")
    await expect(repository.upsertMachine({ ...correction, recordId: "wrong-id" }))
      .rejects.toThrow("record to edit was not found")
  })

  test("corrects route details, protects structure and preserves the previous automatic option", async () => {
    const item = `ROUTE-EDIT-${suffix}`
    const routeInput = {
      itemUid: item, organizationId, routeCode: "1", replaceSetups: false,
      setups: [{ operationCode: "CUT", operationName: "Cut", sequence: 1, setupNumber: 1 }],
      sourcePayload: { numberOfSetups: 1, stageWeight: 100 },
    }
    const route = await repository.upsertRouteOption(routeInput)
    const job = await repository.upsertWorkOrder({
      itemUid: item, organizationId, jobCardNumber: `ROUTE-JC-${suffix}`,
      orderedQuantity: 10, workOrderNumber: `ROUTE-WO-${suffix}`,
    })
    const setup = await pool.query<{ source_id: string }>(
      "SELECT source_id FROM manufacturing.operation_setups WHERE route_option_id = $1", [route.id]
    )
    const correction = { ...routeInput, recordId: setup.rows[0]!.source_id, rejectDuplicates: true,
      machineFamily: `FAMILY-${suffix}`,
      setups: [{ operationCode: "CUT", operationName: "Cut corrected", sequence: 1, setupNumber: 1 }],
      sourcePayload: { numberOfSetups: 1, stageWeight: 95 },
    }
    await repository.upsertMachine({ organizationId, machineNumber: `FAMILY-MC-${suffix}`,
      sourcePayload: { machineFamily: correction.machineFamily, machineType: "CNC" },
    })
    await repository.upsertRouteOption(correction)
    const corrected = await pool.query<{ operation_name: string; family: string }>(
      "SELECT operation_name, source_payload->>'machineFamily' AS family FROM manufacturing.operation_setups WHERE route_option_id = $1", [route.id]
    )
    expect(corrected.rows[0]?.operation_name).toBe("Cut corrected")
    expect(corrected.rows[0]?.family).toBe(correction.machineFamily)
    await expect(repository.upsertRouteOption({ ...correction,
      setups: [{ ...correction.setups[0]!, sequence: 2 }],
    })).rejects.toThrow("requires a new route option")
    await repository.upsertRouteOption({ ...routeInput, routeCode: "2" })
    const selection = await pool.query<{ route_option_id: string }>(
      "SELECT route_option_id FROM manufacturing.route_selections WHERE work_order_id = $1 AND reversed_at IS NULL", [job.id]
    )
    expect(selection.rows).toEqual([{ route_option_id: route.id }])
    await expect(repository.upsertRouteOption({ ...routeInput,
      setups: [{ operationCode: "FORM", sequence: 2, setupNumber: 2 }],
      sourcePayload: { numberOfSetups: 2, stageWeight: 90 },
    })).rejects.toThrow("requires a new route option")
  })

  test("upserts normalized masters, work orders, and route setups by business key", async () => {
    const machine = await repository.upsertMachine({
      machineNumber: firstMachine,
      name: "Planning machine one",
      organizationId,
    })
    const sameMachine = await repository.upsertMachine({
      machineNumber: firstMachine,
      name: "Planning machine one revised",
      organizationId,
    })
    await repository.upsertMachine({
      machineNumber: secondMachine,
      name: "Planning machine two",
      organizationId,
    })
    expect(sameMachine.id).toBe(machine.id)

    await repository.upsertWorkOrder({
      itemUid,
      jobCardNumber: firstJobCard,
      orderedQuantity: 100,
      organizationId,
      workOrderNumber: `WO-${suffix}-1`,
    })
    await repository.upsertWorkOrder({
      itemUid,
      jobCardNumber: secondJobCard,
      orderedQuantity: 50,
      organizationId,
      workOrderNumber: `WO-${suffix}-2`,
    })
    await repository.upsertRouteOption({
      itemUid,
      organizationId,
      routeCode: "1",
      setups: [
        { operationCode: "CUT", sequence: 1, setupNumber: 1 },
        { operationCode: "FORM", sequence: 2, setupNumber: 2 },
      ],
    })
    await repository.upsertRouteOption({
      itemUid,
      organizationId,
      routeCode: "2",
      setups: [{ operationCode: "CUT-ALT", sequence: 1, setupNumber: 1 }],
    })
    await repository.upsertCycleStandard({
      cycleTimeSeconds: 30,
      itemUid,
      organizationId,
      piecesPerCycle: 2,
      routeCode: "1",
      setupNumber: 1,
      setupTimeMinutes: 5,
    })
    await repository.upsertTooling({
      description: "Cutting fixture",
      itemUid,
      organizationId,
      quantity: 2,
      routeCode: "1",
      setupNumber: 1,
      toolCode: toolingAssetCode,
    })
    await repository.upsertPlanningCalendarException({
      exceptionDate: "2026-08-15",
      name: "Independence Day",
      organizationId,
    })

    const counts = await pool.query<{
      calendar: string
      cycles: string
      machines: string
      routes: string
      setups: string
      tooling: string
      work_orders: string
    }>(
      `
        SELECT
          (SELECT count(*) FROM catalog.machines
            WHERE organization_id = $1 AND machine_number LIKE $2) AS machines,
          (SELECT count(*) FROM manufacturing.work_orders
            WHERE organization_id = $1 AND job_card_number LIKE $3) AS work_orders,
          (SELECT count(*) FROM manufacturing.route_options
            WHERE organization_id = $1 AND item_id = $4) AS routes,
          (SELECT count(*) FROM manufacturing.operation_setups setup
            JOIN manufacturing.route_options route ON route.id = setup.route_option_id
            WHERE route.item_id = $4) AS setups,
          (SELECT count(*) FROM manufacturing.operation_cycle_standards standard
            JOIN manufacturing.operation_setups setup ON setup.id = standard.operation_setup_id
            JOIN manufacturing.route_options route ON route.id = setup.route_option_id
            WHERE route.item_id = $4) AS cycles,
          (SELECT count(*) FROM manufacturing.operation_tooling tooling
            JOIN manufacturing.operation_setups setup ON setup.id = tooling.operation_setup_id
            JOIN manufacturing.route_options route ON route.id = setup.route_option_id
            WHERE route.item_id = $4) AS tooling,
          (SELECT count(*) FROM manufacturing.planning_calendar_exceptions
            WHERE organization_id = $1 AND exception_date = '2026-08-15') AS calendar
      `,
      [organizationId, `MC-${suffix}-%`, `JC-${suffix}-%`, itemId]
    )
    expect(counts.rows[0]).toMatchObject({
      calendar: "1",
      cycles: "1",
      machines: "2",
      routes: "2",
      setups: "3",
      tooling: "1",
      work_orders: "2",
    })
  })

  test("supersedes route selection and records every planning decision with durable refresh work", async () => {
    await repository.selectRoute({
      jobCardNumber: firstJobCard,
      organizationId,
      routeCode: "1",
    })
    await repository.selectRoute({
      jobCardNumber: firstJobCard,
      organizationId,
      routeCode: "2",
    })
    await repository.selectRoute({
      jobCardNumber: secondJobCard,
      organizationId,
      routeCode: "1",
    })
    await repository.recordPlannerPriority({
      confirmedSetupNumbers: ["1"],
      interruptedSetups: [
        {
          jobCardNumber: secondJobCard,
          machineNumber: firstMachine,
          setupNumber: 1,
        },
      ],
      jobCardNumber: firstJobCard,
      organizationId,
      priority: "Urgent",
      queueBeforeSetups: [
        {
          jobCardNumber: secondJobCard,
          machineNumber: secondMachine,
          setupNumber: 2,
          targetSetupNumber: 1,
        },
      ],
      remark: "Customer escalation",
    })
    await repository.recordMachineConstraint({
      interruptedSetups: [
        {
          jobCardNumber: secondJobCard,
          machineNumber: firstMachine,
          setupNumber: 1,
        },
      ],
      machineNumber: firstMachine,
      organizationId,
      planningMode: "Preserve queue",
      queuePlacements: [
        {
          queueBeforeSetups: [
            {
              jobCardNumber: firstJobCard,
              machineNumber: firstMachine,
              setupNumber: 1,
            },
          ],
          targetJobCardNumber: secondJobCard,
          targetMachineNumber: secondMachine,
          targetSetupNumber: 2,
        },
      ],
      reason: "Breakdown",
      rescheduleAction: "Move interrupted work",
      unavailableFrom: "2026-07-21T10:00:00+05:30",
      unavailableTo: "2026-07-21T12:00:00+05:30",
    })
    await repository.recordPlanOverride({
      fromMachineNumber: firstMachine,
      interruptedSetups: [
        {
          jobCardNumber: secondJobCard,
          machineNumber: firstMachine,
          setupNumber: 1,
        },
      ],
      jobCardNumber: firstJobCard,
      organizationId,
      queuePlacements: [
        {
          queueBeforeSetups: [
            {
              jobCardNumber: secondJobCard,
              machineNumber: firstMachine,
              setupNumber: 1,
            },
          ],
          targetJobCardNumber: secondJobCard,
          targetMachineNumber: secondMachine,
          targetSetupNumber: 2,
        },
      ],
      reason: "Move to available machine",
      setupNumber: 1,
      toMachineNumber: secondMachine,
    })
    await repository.recordRouteChange({
      jobCardNumber: firstJobCard,
      newRouteCode: "1",
      organizationId,
      remainingSetups: [
        { plan: true, quantity: 60, setupNumber: 1 },
        {
          plan: false,
          quantity: 0,
          remark: "Skip after approved reroute",
          setupNumber: 2,
        },
      ],
      reason: "Restore approved route",
    })
    const workspace = await jobCards.readJobCardWorkspace({
      jobCardNumber: firstJobCard, organizationId,
    })
    expect(workspace.routes.find((route) => route.selected)).toMatchObject({ routeCode: "1" })
    expect(workspace.setups.map((setup) => setup.setupNumber)).toEqual(["1", "2"])

    const result = await pool.query<{
      constraints: string
      constraint_details: string
      current_routes: string
      jobs: string
      outbox_events: string
      overrides: string
      override_details: string
      priorities: string
      priority_details: string
      route_changes: string
      route_change_setups: string
      route_history: string
    }>(
      `
        SELECT
          (SELECT count(*) FROM manufacturing.route_selections selection
            JOIN manufacturing.work_orders work_order ON work_order.id = selection.work_order_id
            WHERE work_order.job_card_number = $1) AS route_history,
          (SELECT count(*) FROM manufacturing.route_selections selection
            JOIN manufacturing.work_orders work_order ON work_order.id = selection.work_order_id
            WHERE work_order.job_card_number = $1 AND selection.reversed_at IS NULL) AS current_routes,
          (SELECT count(*) FROM manufacturing.planner_priority_events
            WHERE source_system = 'mrm-dashboard' AND source_payload->>'jobCardNumber' = $1) AS priorities,
          (SELECT count(*) FROM manufacturing.planner_priority_event_details detail
            JOIN manufacturing.planner_priority_events event
              ON event.id = detail.planner_priority_event_id
            WHERE event.source_system = 'mrm-dashboard'
              AND event.source_payload->>'jobCardNumber' = $1) AS priority_details,
          (SELECT count(*) FROM manufacturing.machine_constraint_events
            WHERE source_system = 'mrm-dashboard' AND source_payload->>'machineNumber' = $2) AS constraints,
          (SELECT count(*) FROM manufacturing.machine_constraint_event_details detail
            JOIN manufacturing.machine_constraint_events event
              ON event.id = detail.machine_constraint_event_id
            WHERE event.source_system = 'mrm-dashboard'
              AND event.source_payload->>'machineNumber' = $2) AS constraint_details,
          (SELECT count(*) FROM manufacturing.plan_override_events
            WHERE source_system = 'mrm-dashboard' AND source_payload->>'jobCardNumber' = $1) AS overrides,
          (SELECT count(*) FROM manufacturing.plan_override_event_details detail
            JOIN manufacturing.plan_override_events event
              ON event.id = detail.plan_override_event_id
            WHERE event.source_system = 'mrm-dashboard'
              AND event.source_payload->>'jobCardNumber' = $1) AS override_details,
          (SELECT count(*) FROM manufacturing.route_change_events
            WHERE source_system = 'mrm-dashboard' AND source_payload->>'jobCardNumber' = $1) AS route_changes,
          (SELECT count(*) FROM manufacturing.route_change_event_setups setup
            JOIN manufacturing.route_change_events event
              ON event.id = setup.route_change_event_id
            WHERE event.source_system = 'mrm-dashboard'
              AND event.source_payload->>'jobCardNumber' = $1) AS route_change_setups,
          (SELECT count(*) FROM derived.refresh_jobs
            WHERE organization_id = $3 AND (queue_key = 'dashboard' OR queue_key LIKE 'dashboard:%')) AS jobs,
          (SELECT count(*) FROM derived.outbox_events
            WHERE organization_id = $3
              AND topic = 'dashboard.refresh.requested') AS outbox_events
      `,
      [firstJobCard, firstMachine, organizationId]
    )
    expect(result.rows[0]).toMatchObject({
      constraints: "1",
      constraint_details: "3",
      current_routes: "1",
      jobs: "1",
      outbox_events: "1",
      overrides: "1",
      override_details: "3",
      priorities: "1",
      priority_details: "3",
      route_changes: "1",
      route_change_setups: "2",
      route_history: "2",
    })
    await repository.recordRouteChange({
      jobCardNumber: firstJobCard,
      newRouteCode: "2",
      organizationId,
      remainingSetups: [{ plan: true, quantity: 60, setupNumber: 1 }],
      reason: "Continue on second route",
    })
    const changes = await pool.query<{ from_code: string; to_code: string }>(`
      SELECT previous.route_code AS from_code, next.route_code AS to_code
      FROM manufacturing.route_change_events event
      JOIN manufacturing.work_orders work_order ON work_order.id = event.work_order_id
      JOIN manufacturing.route_options previous ON previous.id = event.from_route_option_id
      JOIN manufacturing.route_options next ON next.id = event.to_route_option_id
      WHERE work_order.job_card_number = $1 AND event.reversed_at IS NULL
      ORDER BY event.occurred_at, event.id
    `, [firstJobCard])
    expect(changes.rows).toEqual([
      { from_code: "2", to_code: "1" },
      { from_code: "1", to_code: "2" },
    ])
    const source = await readCanonicalDashboardSource(pool, organizationId)
    expect(source.routeChanges.find((change) => change.jobCardNumber === firstJobCard
      && change.newRouteCode === "2")?.fromRouteCode).toBe("1")
  })

  test("planner actions use the changed route and reject old-route active state", async () => {
    const changedItem = `ACTION-ROUTE-${suffix}`
    const changedJobCard = `ACTION-ROUTE-JC-${suffix}`
    const targetMachine = `ACTION-ROUTE-MC-${suffix}`
    const staleMachine = `ACTION-ROUTE-OLD-MC-${suffix}`
    for (const machineNumber of [targetMachine, staleMachine]) {
      await repository.upsertMachine({ organizationId, machineNumber, productionFloorCode: "cnc" })
    }
    for (const routeCode of ["OLD", "NEW"]) {
      await repository.upsertRouteOption({
        itemUid: changedItem, organizationId, productionFloorCode: "cnc", routeCode,
        setups: [1, 2].map((setupNumber) => ({
          operationCode: `SETUP-${setupNumber}`, sequence: setupNumber, setupNumber,
        })),
      })
    }
    await repository.upsertWorkOrder({
      itemUid: changedItem, jobCardNumber: changedJobCard, organizationId,
      orderedQuantity: 20, workOrderNumber: changedJobCard,
      sourcePayload: { optionNumber: "OLD", productionFloorCode: "cnc" },
    })
    await repository.selectRoute({ jobCardNumber: changedJobCard, organizationId,
      productionFloorCode: "cnc", routeCode: "OLD" })
    await pool.query(
      `INSERT INTO manufacturing.shop_floor_setup_state (
         organization_id, work_order_id, route_option_id, operation_setup_id,
         machine_id, stage, active, source_system, source_table, source_id
       ) SELECT $1, work_order.id, route.id, setup.id, machine.id,
         'operator_started', true, 'test', 'old-route-state', $2
       FROM manufacturing.work_orders work_order
       JOIN manufacturing.route_options route
         ON route.item_id = work_order.item_id AND route.route_code = 'OLD'
       JOIN manufacturing.operation_setups setup
         ON setup.route_option_id = route.id AND setup.setup_number = 2
       JOIN catalog.machines machine
         ON machine.organization_id = $1 AND machine.machine_number = $3
       WHERE work_order.organization_id = $1 AND work_order.job_card_number = $4`,
      [organizationId, `old-route-state:${suffix}`, staleMachine, changedJobCard]
    )
    await repository.recordRouteChange({
      jobCardNumber: changedJobCard, organizationId, newRouteCode: "NEW",
      productionFloorCode: "cnc",
      reason: "Use revised route", remainingSetups: [{ setupNumber: 2, plan: true, quantity: 20 }],
    })
    const released = await pool.query<{ stage: string; active: boolean }>(
      `SELECT state.stage, state.active FROM manufacturing.shop_floor_setup_state state
       JOIN manufacturing.work_orders work_order ON work_order.id = state.work_order_id
       WHERE work_order.organization_id = $1 AND work_order.job_card_number = $2`,
      [organizationId, changedJobCard]
    )
    expect(released.rows).toEqual([{ stage: "planned", active: false }])
    const source = await readCanonicalDashboardSource(pool, organizationId)
    expect(source.routeChanges.find((row) => row.jobCardNumber === changedJobCard)?.partCode).toBe(changedItem)
    const live = await readDirectDashboardFacts(pool, organizationId, "cnc", [], ["routeChanges"])
    expect(live.productionControl.plannerActionLog).toEqual(expect.arrayContaining([
      expect.objectContaining({ jobCardNumber: changedJobCard, partCode: changedItem }),
    ]))
    const saved = await repository.recordPlanOverride({
      assignmentMode: "add_parallel_machine", jobCardNumber: changedJobCard,
      organizationId, productionFloorCode: "cnc", reason: "Use new route setup", setupNumber: 2,
      toMachineNumber: targetMachine,
      queuePlacements: [{ targetJobCardNumber: changedJobCard,
        targetMachineNumber: targetMachine, targetSetupNumber: 2 }],
    })
    const reference = await pool.query<{ actual_setup_id: string; detail_setup_id: string; expected_setup_id: string }>(
      `SELECT event.operation_setup_id AS actual_setup_id,
         detail.related_setup_id AS detail_setup_id,
         setup.id AS expected_setup_id
       FROM manufacturing.plan_override_events event
       JOIN manufacturing.plan_override_event_details detail
         ON detail.plan_override_event_id = event.id AND detail.detail_type = 'queue-placement'
       JOIN manufacturing.operation_setups setup
         ON setup.setup_number = 2 AND setup.route_option_id = (
           SELECT id FROM manufacturing.route_options
           WHERE item_id = (SELECT item_id FROM manufacturing.work_orders WHERE job_card_number = $2)
             AND route_code = 'NEW')
       WHERE event.id = $1`,
      [saved.id, changedJobCard]
    )
    expect(reference.rows[0]?.actual_setup_id).toBe(reference.rows[0]?.expected_setup_id)
    expect(reference.rows[0]?.detail_setup_id).toBe(reference.rows[0]?.expected_setup_id)

    await pool.query(
      `UPDATE manufacturing.shop_floor_setup_state SET stage = 'operator_started', active = true
       WHERE organization_id = $1 AND source_id = $2`,
      [organizationId, `old-route-state:${suffix}`]
    )
    await expect(repository.recordMachineConstraint({
      interruptedSetups: [{ jobCardNumber: changedJobCard, machineNumber: staleMachine, setupNumber: 2 }],
      machineNumber: staleMachine, organizationId, productionFloorCode: "cnc",
      reason: "Unavailable after route change", rescheduleAction: "shift_required",
      unavailableFrom: "2026-10-06T10:00:00+05:30",
    })).rejects.toThrow("Active setup belongs to an earlier route")
  })

  test("blocks planner output duplication and records canonical closed-session output", async () => {
    await repository.selectRoute({
      jobCardNumber: firstJobCard,
      organizationId,
      routeCode: "1",
    })
    const operatorCode = `OP-${suffix}`
    const employee = await pool.query<{ id: string }>(
      `
        INSERT INTO workforce.employees (
          organization_id, employee_code, name, department, designation,
          source_system, source_table, source_id
        ) VALUES ($1, $2, 'Planner settlement operator', 'Shop Floor',
          'Worker', 'test', 'employees', $3)
        RETURNING id
      `,
      [organizationId, operatorCode, randomUUID()]
    )
    const reference = await pool.query<{
      item_uid: string
      machine_id: string
      operation_setup_id: string
      route_code: string
      route_option_id: string
      work_order_id: string
    }>(
      `
        SELECT work_order.id AS work_order_id,
          selection.route_option_id, setup.id AS operation_setup_id,
          machine.id AS machine_id, item.uid AS item_uid,
          route.route_code
        FROM manufacturing.work_orders work_order
        JOIN catalog.items item ON item.id = work_order.item_id
        JOIN manufacturing.route_selections selection
          ON selection.work_order_id = work_order.id
          AND selection.reversed_at IS NULL
        JOIN manufacturing.route_options route
          ON route.id = selection.route_option_id
        JOIN manufacturing.operation_setups setup
          ON setup.route_option_id = route.id AND setup.setup_number = 1
        JOIN catalog.machines machine
          ON machine.organization_id = work_order.organization_id
          AND machine.machine_number = $3
        WHERE work_order.organization_id = $1
          AND work_order.job_card_number = $2
      `,
      [organizationId, firstJobCard, firstMachine]
    )
    const ids = reference.rows[0]!
    const productionEntryId = randomUUID()
    await pool.query(
      `
        INSERT INTO manufacturing.production_entries (
          id, organization_id, work_order_id, route_option_id,
          operation_setup_id, machine_id, operator_employee_id,
          production_date, shift, quantity_good, quantity_rejected,
          started_at, source_system, source_table, source_id, source_payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, '2026-08-16',
          'General', 0, 0, '2026-08-16T08:30:00+05:30',
          'test', 'production_entries', $8, '{}'::jsonb)
      `,
      [
        productionEntryId,
        organizationId,
        ids.work_order_id,
        ids.route_option_id,
        ids.operation_setup_id,
        ids.machine_id,
        employee.rows[0]!.id,
        randomUUID(),
      ]
    )
    const sessionId = randomUUID()
    const sessionReference = `${firstMachine}-20260816-01`
    await pool.query(
      `
        INSERT INTO manufacturing.production_sessions (
          id, organization_id, work_order_id, route_option_id,
          operation_setup_id, machine_id, operator_employee_id,
          production_date, shift, measurement_method, status, started_at,
          piece_weight_grams, production_entry_id, source_payload,
          session_reference, daily_sequence, machine_number_snapshot,
          job_card_number_snapshot, part_code_snapshot,
          option_number_snapshot, setup_number_snapshot,
          operator_code_snapshot, operator_name_snapshot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, '2026-08-16',
          'General', 'weight', 'open', '2026-08-16T08:30:00+05:30',
          15.4, $8, '{}'::jsonb, $9, 1, $10, $11, $12, $13,
          '1', $14, 'Planner settlement operator')
      `,
      [
        sessionId,
        organizationId,
        ids.work_order_id,
        ids.route_option_id,
        ids.operation_setup_id,
        ids.machine_id,
        employee.rows[0]!.id,
        productionEntryId,
        sessionReference,
        firstMachine,
        firstJobCard,
        ids.item_uid,
        ids.route_code,
        operatorCode,
      ]
    )
    const interruption = [{
      jobCardNumber: firstJobCard,
      machineNumber: firstMachine,
      setupNumber: 1,
    }]

    await expect(repository.recordMachineConstraint({
      machineNumber: firstMachine,
      organizationId,
      reason: "Breakdown",
      rescheduleAction: "shift_required",
      unavailableFrom: "2026-08-16T16:00:00+05:30",
    })).rejects.toThrow(`Close Production Session ${sessionReference} using Weight`)

    await expect(repository.recordMachineConstraint({
      interruptedSetups: interruption,
      machineNumber: firstMachine,
      organizationId,
      reason: "Breakdown",
      rescheduleAction: "delay",
      unavailableFrom: "2026-08-16T16:00:00+05:30",
    })).rejects.toThrow(`Start downtime on Production Session ${sessionReference}`)

    await jobCards.closeProductionSession({
      organizationId, sessionId, endedAt: "2026-08-16T16:00:00+05:30",
      endReason: "manual_stop", grossWeightKg: 0.616, crateCount: 0, crateWeightKg: 0,
    })
    await repository.recordMachineConstraint({
      interruptedSetups: interruption,
      machineNumber: firstMachine,
      organizationId,
      reason: "Breakdown after settled weight",
      rescheduleAction: "shift_required",
      unavailableFrom: "2026-08-16T16:00:00+05:30",
    })
    const saved = await pool.query<{
      finished_quantity: string
      session_references: string[]
      settled_at: string
    }>(
      `
        SELECT detail.evidence->>'finishedQuantity' AS finished_quantity,
          detail.evidence->'sessionReferences' AS session_references,
          detail.evidence->>'settledAt' AS settled_at
        FROM manufacturing.machine_constraint_event_details detail
        JOIN manufacturing.machine_constraint_events event
          ON event.id = detail.machine_constraint_event_id
        WHERE event.organization_id = $1
          AND event.reason = 'Breakdown after settled weight'
          AND detail.impact_type = 'interrupted-setup'
      `,
      [organizationId]
    )
    expect(saved.rows).toEqual([{
      finished_quantity: "40",
      session_references: [sessionReference],
      settled_at: "2026-08-16T10:30:00.000Z",
    }])

    await repository.recordPlanOverride({
      fromMachineNumber: firstMachine,
      jobCardNumber: firstJobCard,
      organizationId,
      reason: "Shift after machine breakdown",
      setupNumber: 1,
      toMachineNumber: secondMachine,
    })
    const workspace = await jobCards.readJobCardWorkspace({
      jobCardNumber: firstJobCard,
      organizationId,
      productionFloorCode: "conventional",
    })
    expect(workspace.plannerMovements).toContainEqual(expect.objectContaining({
      actionLabel: "Machine shifted",
      actionType: "machine_shift",
      fromMachineNumber: firstMachine,
      reason: "Shift after machine breakdown",
      sessionReferences: [sessionReference],
      settledGoodPieces: 40,
      setupNumber: "1",
      toMachineNumber: secondMachine,
    }))
  })

  test("keeps queued move and parallel targets running and releases approved interruptions", async () => {
    const moveItemUid = `MOVE-${suffix}`
    const movingJobCard = `MOVE-${suffix}-1`
    const blockingJobCard = `MOVE-${suffix}-2`
    const sourceMachine = `MOVE-${suffix}-SRC`
    const targetMachine = `MOVE-${suffix}-TGT`
    await repository.upsertRouteOption({
      itemUid: moveItemUid,
      organizationId,
      routeCode: "1",
      setups: [{ operationCode: "MOVE", sequence: 1, setupNumber: 1 }],
    })
    await repository.upsertWorkOrder({
      itemUid: moveItemUid,
      jobCardNumber: movingJobCard,
      orderedQuantity: 20,
      organizationId,
      workOrderNumber: `MOVE-WO-${suffix}-1`,
    })
    await repository.upsertWorkOrder({
      itemUid: moveItemUid,
      jobCardNumber: blockingJobCard,
      orderedQuantity: 20,
      organizationId,
      workOrderNumber: `MOVE-WO-${suffix}-2`,
    })
    await repository.selectRoute({
      jobCardNumber: movingJobCard,
      organizationId,
      routeCode: "1",
    })
    await repository.selectRoute({
      jobCardNumber: blockingJobCard,
      organizationId,
      routeCode: "1",
    })
    await repository.upsertMachine({ machineNumber: sourceMachine, organizationId })
    await repository.upsertMachine({ machineNumber: targetMachine, organizationId })
    const ids = await pool.query<{
      machine_id: string
      route_option_id: string
      setup_id: string
      work_order_id: string
    }>(
      `
        SELECT machine.id AS machine_id, route.id AS route_option_id,
          setup.id AS setup_id, work_order.id AS work_order_id
        FROM catalog.machines machine
        CROSS JOIN manufacturing.work_orders work_order
        JOIN catalog.items item ON item.id = work_order.item_id
        JOIN manufacturing.route_options route ON route.item_id = item.id
          AND route.route_code = '1'
        JOIN manufacturing.operation_setups setup
          ON setup.route_option_id = route.id AND setup.setup_number = 1
        WHERE machine.organization_id = $1
          AND machine.machine_number = $2
          AND work_order.job_card_number = $3
      `,
      [organizationId, targetMachine, blockingJobCard]
    )
    const row = ids.rows[0]!
    await pool.query(
      `
        INSERT INTO manufacturing.shop_floor_setup_state (
          organization_id, work_order_id, route_option_id,
          operation_setup_id, machine_id, stage, active,
          source_system, source_table, source_id
        )
        VALUES ($1, $2, $3, $4, $5, 'Production', true,
          'test', 'shop_floor_setup_state', $6)
      `,
      [
        organizationId,
        row.work_order_id,
        row.route_option_id,
        row.setup_id,
        row.machine_id,
        randomUUID(),
      ]
    )

    await expect(repository.recordPlanOverride({
      assignmentMode: "add_parallel_machine",
      jobCardNumber: movingJobCard,
      organizationId,
      reason: "Parallel target requires stop",
      setupNumber: 1,
      toMachineNumber: targetMachine,
    })).rejects.toThrow("Approve its stop")
    const parallel = await repository.recordPlanOverride({
      assignmentMode: "add_parallel_machine",
      interruptedSetups: [{
        jobCardNumber: blockingJobCard,
        machineNumber: targetMachine,
        setupNumber: 1,
      }],
      jobCardNumber: movingJobCard,
      organizationId,
      reason: "Approved parallel target stop",
      setupNumber: 1,
      toMachineNumber: targetMachine,
    })
    const parallelState = await pool.query<{ active: boolean; assignment_mode: string }>(
      `SELECT state.active, decision.source_payload->>'assignmentMode' AS assignment_mode
       FROM manufacturing.shop_floor_setup_state state
       CROSS JOIN manufacturing.plan_override_events decision
       WHERE state.work_order_id = $1 AND state.machine_id = $2 AND decision.id = $3`,
      [row.work_order_id, row.machine_id, parallel.id]
    )
    expect(parallelState.rows[0]).toEqual({ active: false, assignment_mode: "add_parallel_machine" })
    await pool.query("UPDATE manufacturing.shop_floor_setup_state SET active=true, stage='operator_started' WHERE work_order_id=$1 AND machine_id=$2", [row.work_order_id, row.machine_id])

    await expect(
      repository.recordPlanOverride({
        fromMachineNumber: sourceMachine,
        jobCardNumber: movingJobCard,
        organizationId,
        reason: "Unsafe move",
        setupNumber: 1,
        toMachineNumber: targetMachine,
      })
    ).rejects.toMatchObject({
      status: 409,
      message: `${targetMachine} is assigned to Job Card ${blockingJobCard}, Setup 1. Approve its stop in the target machine review and close any open Production Session before moving this setup.`,
    })

    const targetBeforeQueue = await pool.query(
      "SELECT active, stage, row_version FROM manufacturing.shop_floor_setup_state WHERE work_order_id=$1 AND machine_id=$2",
      [row.work_order_id, row.machine_id]
    )
    await repository.recordPlanOverride({
      fromMachineNumber: sourceMachine,
      jobCardNumber: movingJobCard,
      organizationId,
      queuePlacements: [{
        targetJobCardNumber: movingJobCard,
        targetMachineNumber: targetMachine,
        targetSetupNumber: 1,
        queueBeforeSetups: [],
      }],
      reason: "Queue after the active target setup",
      setupNumber: 1,
      toMachineNumber: targetMachine,
    })
    const targetAfterQueue = await pool.query(
      "SELECT active, stage, row_version FROM manufacturing.shop_floor_setup_state WHERE work_order_id=$1 AND machine_id=$2",
      [row.work_order_id, row.machine_id]
    )
    expect(targetAfterQueue.rows).toEqual(targetBeforeQueue.rows)

    await repository.recordPlanOverride({
      assignmentMode: "add_parallel_machine",
      jobCardNumber: movingJobCard,
      organizationId,
      queuePlacements: [{
        targetJobCardNumber: movingJobCard,
        targetMachineNumber: targetMachine,
        targetSetupNumber: 1,
        queueBeforeSetups: [],
      }],
      reason: "Queue parallel work after the active target setup",
      setupNumber: 1,
      toMachineNumber: targetMachine,
    })
    const targetAfterParallelQueue = await pool.query(
      "SELECT active, stage, row_version FROM manufacturing.shop_floor_setup_state WHERE work_order_id=$1 AND machine_id=$2",
      [row.work_order_id, row.machine_id]
    )
    expect(targetAfterParallelQueue.rows).toEqual(targetBeforeQueue.rows)

    await repository.recordPlanOverride({
      fromMachineNumber: sourceMachine,
      interruptedSetups: [{
        jobCardNumber: blockingJobCard,
        machineNumber: targetMachine,
        setupNumber: 1,
      }],
      jobCardNumber: movingJobCard,
      organizationId,
      reason: "Approved target interruption",
      setupNumber: 1,
      toMachineNumber: targetMachine,
    })

    const released = await pool.query<{
      active: boolean
      stage: string
      stop_events: string
    }>(
      `
        SELECT state.active, state.stage,
          (SELECT count(*)
           FROM manufacturing.shop_floor_stage_events event
           WHERE event.setup_state_id = state.id
             AND event.to_stage = 'planned'
             AND event.source_table = 'planOverrides') AS stop_events
        FROM manufacturing.shop_floor_setup_state state
        WHERE state.id = (
          SELECT state.id
          FROM manufacturing.shop_floor_setup_state state
          WHERE state.organization_id = $1
            AND state.work_order_id = $2
            AND state.operation_setup_id = $3
            AND state.machine_id = $4
        )
      `,
      [
        organizationId,
        row.work_order_id,
        row.setup_id,
        row.machine_id,
      ]
    )
    expect(released.rows[0]).toEqual({
      active: false,
      stage: "planned",
      stop_events: "2",
    })
    await repository.recordPlanOverride({
      assignmentMode: "add_parallel_machine",
      jobCardNumber: blockingJobCard,
      organizationId,
      reason: "Parallel approval before the later stop",
      setupNumber: 1,
      toMachineNumber: targetMachine,
    })
    await pool.query("UPDATE manufacturing.shop_floor_setup_state SET active=true, stage='operator_started' WHERE work_order_id=$1 AND machine_id=$2", [row.work_order_id, row.machine_id])
    await repository.recordPlannerPriority({
      jobCardNumber: movingJobCard, organizationId, priority: "Urgent",
      confirmedSetupNumbers: ["1"], approvalMode: "allow_stop_running",
      interruptedSetups: [{ jobCardNumber: blockingJobCard, machineNumber: targetMachine, setupNumber: 1 }],
    })
    const priorityState = await pool.query("SELECT active, stage, completed_at FROM manufacturing.shop_floor_setup_state WHERE work_order_id=$1 AND machine_id=$2", [row.work_order_id, row.machine_id])
    expect(priorityState.rows[0]).toEqual({ active: false, stage: "planned", completed_at: null })

    const restart = {
      jobCardNumber: blockingJobCard,
      machineNumber: sourceMachine,
      operationSetupCode: "1",
      organizationId,
      payload: { partCode: moveItemUid },
      stage: "raw_material_at_machine",
    }
    await jobCards.recordShopFloorStage(restart)
    const restarted = await pool.query<{ machine_number: string; active: boolean; stage: string }>(
      `SELECT machine.machine_number, state.active, state.stage
       FROM manufacturing.shop_floor_setup_state state
       JOIN catalog.machines machine ON machine.id = state.machine_id
       WHERE state.work_order_id = $1 ORDER BY machine.machine_number`,
      [row.work_order_id]
    )
    expect(restarted.rows).toEqual([
      { machine_number: sourceMachine, active: true, stage: "raw_material_at_machine" },
      { machine_number: targetMachine, active: false, stage: "planned" },
    ])
    await expect(jobCards.recordShopFloorStage({ ...restart, machineNumber: targetMachine }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/planner.*machine switch/i) })
  })
})
