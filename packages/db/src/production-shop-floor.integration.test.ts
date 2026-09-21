import { createStoreRepository } from "./store"
import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createDashboardPlanningRepository } from "./dashboard-planning"
import { migrateDatabase } from "./migrate"
import { createProductionShopFloorRepository } from "./production-shop-floor"
import { createQualityRepository } from "./quality"
import { createRejectionRepository } from "./rejections"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const planning = createDashboardPlanningRepository({ connectionString })
const repository = createProductionShopFloorRepository({ connectionString })
const quality = createQualityRepository({ connectionString })
const suffix = randomUUID().slice(0, 8)
const itemUid = `FLOOR-${suffix}`
const firstJobCard = `FLOOR-JC-${suffix}-1`
const secondJobCard = `FLOOR-JC-${suffix}-2`
const thirdJobCard = `FLOOR-JC-${suffix}-3`
const fourthJobCard = `FLOOR-JC-${suffix}-4`
const cncJobCard = `FLOOR-JC-${suffix}-CNC`
const firstMachine = `FLOOR-MC-${suffix}-1`
const secondMachine = `FLOOR-MC-${suffix}-2`
const cncMachine = `FLOOR-CNC-${suffix}`
const firstOperator = `FLOOR-OP-${suffix}-1`
const secondOperator = `FLOOR-OP-${suffix}-2`
const hrOperator = `FLOOR-HR-OP-${suffix}`
const rmPoNumber = `RM-${suffix}`
let organizationId: string
let productionEntryId: string

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
      ) VALUES ($1, 'conventional', 'Conventional Production Floor')
      ON CONFLICT (organization_id, code) DO NOTHING
    `,
    [organizationId]
  )
  await pool.query(
    `
      INSERT INTO manufacturing.production_floors (
        organization_id, code, name
      ) VALUES ($1, 'cnc', 'CNC Production Floor')
      ON CONFLICT (organization_id, code) DO NOTHING
    `,
    [organizationId]
  )
  await pool.query(
    `
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        item_type, casting, weight_100_pcs,
        source_system, source_table, source_id
      )
      VALUES (
        $1, $2, 'INTERNAL', 'M', $2, 'List', 5.022, 0.90,
        'test', 'items', $3
      )
    `,
    [organizationId, itemUid, randomUUID()]
  )
  await planning.upsertMachine({
    machineNumber: firstMachine,
    organizationId,
  })
  await planning.upsertMachine({
    machineNumber: secondMachine,
    organizationId,
  })
  await planning.upsertMachine({
    machineNumber: cncMachine,
    organizationId,
    productionFloorCode: "cnc",
    sourcePayload: { machineFamily: `OLD-FAMILY-${suffix}`, machineType: "CNC" },
  })
  for (const [index, jobCardNumber] of [
    firstJobCard,
    secondJobCard,
    thirdJobCard,
    fourthJobCard,
  ].entries()) {
    await planning.upsertWorkOrder({
      itemUid,
      jobCardNumber,
      orderedQuantity: 100,
      organizationId,
      sourcePayload: {
        jcNo: jobCardNumber,
        partCode: itemUid,
        rmPoNo: rmPoNumber,
      },
      workOrderNumber: `FLOOR-WO-${suffix}-${index + 1}`,
    })
  }
  await planning.upsertRouteOption({
    itemUid,
    organizationId,
    routeCode: "1",
    setups: [
      { operationCode: "CUT", sequence: 1, setupNumber: 1 },
      { operationCode: "FORM", sequence: 2, setupNumber: 2 },
    ],
  })
  await planning.upsertWorkOrder({
    itemUid,
    jobCardNumber: cncJobCard,
    orderedQuantity: 2_000,
    organizationId,
    sourcePayload: {
      productionFloorCode: "cnc",
      jcNo: cncJobCard,
      partCode: itemUid,
      rmPoNo: rmPoNumber,
    },
    workOrderNumber: `FLOOR-WO-${suffix}-CNC`,
  })
  await planning.upsertRouteOption({
    itemUid,
    organizationId,
    productionFloorCode: "cnc",
    routeCode: "CNC-1",
    machineFamily: `OLD-FAMILY-${suffix}`,
    setups: [
      { operationCode: "TURN", sequence: 1, setupNumber: 1 },
    ],
  })
  await planning.selectRoute({
    jobCardNumber: firstJobCard,
    organizationId,
    routeCode: "1",
  })
  await planning.selectRoute({
    jobCardNumber: secondJobCard,
    organizationId,
    routeCode: "1",
  })
  await planning.selectRoute({
    jobCardNumber: cncJobCard,
    organizationId,
    productionFloorCode: "cnc",
    routeCode: "CNC-1",
  })
  for (const [index, employeeCode] of [firstOperator, secondOperator].entries()) {
    await pool.query(
      `
        INSERT INTO workforce.employees (
          organization_id, employee_code, name, department, designation,
          source_system, source_table, source_id
        ) VALUES ($1, $2, $3, 'Shop Floor', 'Worker', 'test', 'employees', $4)
      `,
      [organizationId, employeeCode, `Operator ${index + 1}`, randomUUID()]
    )
  }
})

afterAll(async () => {
  await planning.close()
  await repository.close()
  await quality.close()
  await pool.end()
})

describe("production and shop-floor workflows", () => {
  test("calculates Casting from Blank Piece Weight divided by One-Piece Weight", async () => {
    const workspace = await repository.readJobCardWorkspace({
      jobCardNumber: firstJobCard,
      organizationId,
      productionFloorCode: "conventional",
    })

    expect(workspace.jobCard.casting).toBe("5.58")
  })

  test("keeps every received item when one RM PO covers multiple job cards", async () => {
    const jobCards = [firstJobCard, secondJobCard, thirdJobCard, fourthJobCard]

    for (const jcNo of jobCards) {
      await repository.upsertRawMaterialReceipt({
        organizationId,
        payload: { jcNo, rmPoNo: rmPoNumber, partCode: itemUid },
        quantityKg: 25,
        receiptNumber: rmPoNumber,
        receivedOn: "2026-08-12",
      })
    }

    const result = await pool.query<{
      job_cards: string
      receipts: string
    }>(
      `
        SELECT count(*) AS receipts,
          count(DISTINCT lower(source_payload->>'jcNo')) AS job_cards
        FROM manufacturing.raw_material_receipts
        WHERE organization_id = $1 AND receipt_number = $2
      `,
      [organizationId, rmPoNumber]
    )

    expect(result.rows[0]).toEqual({ job_cards: "4", receipts: "4" })
  })

  test.each([
    {
      expected: /Job Card .* was not found in Work Orders/,
      name: "Job Card",
      payload: {
        jcNo: `UNKNOWN-${suffix}`,
        partCode: itemUid,
        rmPoNo: rmPoNumber,
      },
    },
    {
      expected: /RM PO Number .* does not match Work Order/,
      name: "RM PO Number",
      payload: {
        jcNo: firstJobCard,
        partCode: itemUid,
        rmPoNo: `WRONG-RM-${suffix}`,
      },
    },
    {
      expected: /Part Code .* does not match Work Order/,
      name: "Part Code",
      payload: {
        jcNo: firstJobCard,
        partCode: `WRONG-PART-${suffix}`,
        rmPoNo: rmPoNumber,
      },
    },
  ])("rejects an RM receipt when $name mismatches", async ({ expected, payload }) => {
    await expect(
      repository.upsertRawMaterialReceipt({
        organizationId,
        payload,
        quantityKg: 25,
        receiptNumber: String(payload.rmPoNo),
        receivedOn: "2026-08-12",
      })
    ).rejects.toThrow(expected)
  })

  test("rejects the whole RM batch when one tuple mismatches", async () => {
    const validReceipt = {
      organizationId,
      payload: {
        jcNo: thirdJobCard,
        partCode: itemUid,
        rmPoNo: rmPoNumber,
      },
      receiptNumber: rmPoNumber,
      receivedOn: "2026-08-12",
    }
    await repository.upsertRawMaterialReceipt({
      ...validReceipt,
      quantityKg: 25,
    })

    await expect(
      repository.upsertRawMaterialReceipts([
        { ...validReceipt, quantityKg: 91 },
        {
          ...validReceipt,
          payload: {
            jcNo: fourthJobCard,
            partCode: `WRONG-PART-${suffix}`,
            rmPoNo: rmPoNumber,
          },
          quantityKg: 25,
        },
      ])
    ).rejects.toThrow(/Part Code .* does not match Work Order/)

    const persisted = await pool.query<{ quantity_kg: string }>(
      `
        SELECT quantity_kg::text
        FROM manufacturing.raw_material_receipts
        WHERE organization_id = $1 AND receipt_number = $2
          AND job_card_number = $3
      `,
      [organizationId, rmPoNumber, thirdJobCard]
    )
    expect(persisted.rows[0]?.quantity_kg).toBe("25.00000000")
  })

  test("records separate RM receipts while keeping import retries idempotent", async () => {
    const receipt = await repository.upsertRawMaterialReceipt({
      organizationId,
      payload: {
        jcNo: firstJobCard,
        rmPoNo: rmPoNumber,
        status: "Received",
      },
      quantityKg: 125.5,
      receiptNumber: rmPoNumber,
      receivedOn: "2026-07-20",
      sourceId: `test:rm-receipt:${suffix}:1`,
    })
    const retriedReceipt = await repository.upsertRawMaterialReceipt({
      organizationId,
      payload: {
        jcNo: firstJobCard,
        remark: "Weighed",
        rmPoNo: rmPoNumber,
      },
      quantityKg: 125.5,
      receiptNumber: rmPoNumber,
      receivedOn: "2026-07-20",
      sourceId: `test:rm-receipt:${suffix}:1`,
    })
    const laterReceipt = await repository.upsertRawMaterialReceipt({
      organizationId,
      payload: {
        jcNo: firstJobCard,
        rmPoNo: rmPoNumber,
        status: "Received",
      },
      quantityKg: 126,
      receiptNumber: rmPoNumber,
      receivedOn: "2026-07-22",
      sourceId: `test:rm-receipt:${suffix}:2`,
    })
    expect(retriedReceipt.id).toBe(receipt.id)
    expect(laterReceipt.id).not.toBe(receipt.id)

    const received = await pool.query<{ quantity_kg: string; received_on: string }>(
      `SELECT quantity_kg::text, received_on::text
       FROM manufacturing.raw_material_receipts
       WHERE organization_id = $1 AND source_id = ANY($2::text[])
       ORDER BY received_on`,
      [organizationId, [`test:rm-receipt:${suffix}:1`, `test:rm-receipt:${suffix}:2`]]
    )
    expect(received.rows).toEqual([
      { quantity_kg: "125.50000000", received_on: "2026-07-20" },
      { quantity_kg: "126.00000000", received_on: "2026-07-22" },
    ])
  })

  test("records append-only production", async () => {
    const card = await repository.upsertProductionCard({
      cardNumber: `CARD-${suffix}`,
      jobCardNumber: firstJobCard,
      organizationId,
      payload: {
        cardEntryKind: "production",
        machine: firstMachine,
        outputQty: 10,
        prodDate: "2026-07-21",
        remarks: "Initial card",
        setupNo: "1",
      },
    })
    const sameCard = await repository.upsertProductionCard({
      cardNumber: `CARD-${suffix}`,
      jobCardNumber: firstJobCard,
      organizationId,
      payload: {
        machine: firstMachine,
        outputQty: "",
        prodDate: "2026-07-21",
        remarks: "Updated card",
        setupNo: "1",
      },
    })
    expect(sameCard.id).toBe(card.id)

    const production = await repository.recordProductionEntry({
      jobCardNumber: firstJobCard,
      machineNumber: firstMachine,
      operationSetupCode: "1",
      organizationId,
      payload: {
        actualQty: 10,
        downtimeMinutes: 5,
        operatorId: "OP-1",
        outputQty: 10,
        rejectQty: 1,
        rejectionType: "Visual",
        targetQty: 12,
      },
      productionDate: "2026-07-21",
      quantityGood: 10,
      quantityRejected: 1,
      shift: "A",
      sourceId: `csv:test:${suffix}`,
    })
    const repeatedProduction = await repository.recordProductionEntry({
      jobCardNumber: firstJobCard,
      machineNumber: firstMachine,
      operationSetupCode: "1",
      organizationId,
      payload: {
        actualQty: 10,
        downtimeMinutes: 5,
        operatorId: "OP-1",
        outputQty: 10,
        rejectQty: 1,
        rejectionType: "Visual",
        targetQty: 12,
      },
      productionDate: "2026-07-21",
      quantityGood: 10,
      quantityRejected: 1,
      shift: "A",
      sourceId: `csv:test:${suffix}`,
    })
    expect(repeatedProduction.id).toBe(production.id)
    productionEntryId = production.id

    const result = await pool.query<{
      card_events: string
      cards: string
      output_qty: string
      production_entries: string
      rm_part_code: string
      rm_po_number: string
      raw_material_receipts: string
      remarks: string
    }>(
      `
        SELECT
          (SELECT count(*) FROM manufacturing.production_cards
            WHERE organization_id = $1 AND card_number = $2) AS cards,
          (SELECT source_payload->>'outputQty' FROM manufacturing.production_cards
            WHERE organization_id = $1 AND card_number = $2) AS output_qty,
          (SELECT source_payload->>'remarks' FROM manufacturing.production_cards
            WHERE organization_id = $1 AND card_number = $2) AS remarks,
          (SELECT count(*) FROM manufacturing.production_card_events event
            JOIN manufacturing.production_cards card ON card.id = event.production_card_id
            WHERE card.organization_id = $1 AND card.card_number = $2) AS card_events,
          (SELECT count(*) FROM manufacturing.production_entries
            WHERE id = $3 AND reversed_at IS NULL) AS production_entries,
          (SELECT count(*) FROM manufacturing.raw_material_receipts
            WHERE organization_id = $1 AND receipt_number = $4
              AND quantity_kg = 126
              AND source_payload->>'remark' = 'Weighed') AS raw_material_receipts,
          (SELECT source_payload->>'partCode'
            FROM manufacturing.raw_material_receipts
            WHERE organization_id = $1 AND receipt_number = $4
              AND job_card_number = $5) AS rm_part_code,
          (SELECT source_payload->>'rmPoNo'
            FROM manufacturing.raw_material_receipts
            WHERE organization_id = $1 AND receipt_number = $4
              AND job_card_number = $5) AS rm_po_number
      `,
      [
        organizationId,
        `CARD-${suffix}`,
        productionEntryId,
        rmPoNumber,
        firstJobCard,
      ]
    )
    expect(result.rows[0]).toEqual({
      card_events: "2",
      cards: "1",
      output_qty: "10",
      production_entries: "1",
      rm_part_code: itemUid,
      rm_po_number: rmPoNumber,
      raw_material_receipts: "1",
      remarks: "Updated card",
    })
  })

  test("keeps CNC count continuity across shift sessions and stores linked events", async () => {
    const template = await quality.upsertSetupChecklistTemplate({
      code: `CNC-${suffix}`, name: "CNC Setting", organizationId, productionFloorCode: "cnc",
      payload: { section: "Pre setting" }, revision: 1,
      items: [
        { itemKey: "program", prompt: "Program checked", inputType: "checkbox", sequence: 1, required: true },
        { itemKey: "optional", prompt: "Optional check", inputType: "checkbox", sequence: 2, required: false },
      ],
    })
    const checklist = await quality.saveSetupChecklistSession({
      organizationId, productionFloorCode: "cnc", jobCardNumber: cncJobCard,
      operationSetupCode: "1", machineNumber: cncMachine, templateCode: template.code,
      sessionKey: `CNC-${suffix}`, phase: "end", status: "Completed", completedBy: "Programmer",
      payload: {}, results: [{ itemKey: "program", value: true }],
    })
    expect((await pool.query("SELECT status FROM quality.setup_checklist_sessions WHERE id = $1", [checklist.id])).rows[0]).toEqual({ status: "Completed" })
    const incompleteChecklist = {
      organizationId, productionFloorCode: "cnc", jobCardNumber: cncJobCard,
      operationSetupCode: "1", machineNumber: cncMachine, templateCode: template.code,
      sessionKey: `CNC-${suffix}`, phase: "end" as const, completedBy: "Programmer",
      payload: {}, results: [{ itemKey: "program", value: "" }],
    }
    await quality.saveSetupChecklistSession({ ...incompleteChecklist, status: "In progress" })
    expect((await pool.query("SELECT status, completed_at FROM quality.setup_checklist_sessions WHERE id = $1", [checklist.id])).rows[0]).toEqual({ status: "In progress", completed_at: null })
    await expect(quality.saveSetupChecklistSession({ ...incompleteChecklist, status: "Completed" }))
      .rejects.toThrow("Complete required checklist points")
    const settingAction = {
      organizationId, productionFloorCode: "cnc", jobCardNumber: cncJobCard,
      machineNumber: cncMachine, operationSetupCode: "1", stage: "setting", payload: {},
    }
    await expect(repository.recordShopFloorStage(settingAction)).rejects.toThrow("Complete required checklist points")
    await quality.saveSetupChecklistSession({ ...incompleteChecklist, status: "Completed", results: [{ itemKey: "program", value: false }] })
    await repository.recordShopFloorStage(settingAction)
    await expect(repository.recordShopFloorStage({
      organizationId, productionFloorCode: "cnc", jobCardNumber: cncJobCard,
      machineNumber: cncMachine, operationSetupCode: "1", stage: "presetting", payload: {},
    })).rejects.toThrow("CNC uses Setting only")
    await repository.recordShopFloorStage({
      jobCardNumber: cncJobCard,
      machineNumber: cncMachine,
      operationSetupCode: "1",
      organizationId,
      payload: { doneBy: "Machinist", partCode: itemUid },
      productionFloorCode: "cnc",
      stage: "operator_started",
    })

    const cycleInput = {
      itemUid, organizationId, productionFloorCode: "cnc", routeCode: "CNC-1",
      setupNumber: 1, cycleTimeSeconds: 60, setupTimeMinutes: 12,
      sourcePayload: { partNo: itemUid, optionNumber: "CNC-1", setupNo: "1", cycleTime: 60, pieceWeight: 489 },
    }
    const cycle = await planning.upsertCycleStandard(cycleInput)
    const first = await repository.startProductionSession({
      cycleTimeSeconds: 999, // A stale start form must not override the current master.
      jobCardNumber: cncJobCard,
      machineNumber: cncMachine,
      measurementMethod: "counter",
      operationSetupCode: "1",
      operatorCode: firstOperator,
      organizationId,
      pieceWeightGrams: 489,
      productionDate: "1999-01-01",
      productionFloorCode: "cnc",
      shift: "Wrong",
      startCount: 10_000,
      startedAt: "2026-08-15T06:00:00+05:30",
    })
    await repository.recordProductionSessionDowntime({
      endedAt: "2026-08-15T07:10:00+05:30",
      enteredRole: "machinist",
      organizationId,
      reasonCode: "DC-01",
      reasonName: "Tool adjustment",
      sessionId: first.id,
      startedAt: "2026-08-15T07:00:00+05:30",
    })
    await repository.recordProductionSessionRejection({
      enteredRole: "quality",
      organizationId,
      quantity: 7,
      reasonCode: "DC-02",
      reasonName: "Visual defect",
      remarkCode: "RR-01",
      remarkName: "Segregated",
      sessionId: first.id,
      typeCode: "RT-01",
      typeName: "In-process",
    })
    const workspace = await repository.readJobCardWorkspace({
      organizationId, jobCardNumber: cncJobCard, productionFloorCode: "cnc",
    })
    expect(workspace.events.filter((event) => event.eventType === "rejection"))
      .toEqual([expect.objectContaining({
        rejectionTypeName: "In-process", rejectionReasonName: "Segregated",
        defectName: "Visual defect", quantity: "7",
      })])
    await planning.upsertMachine({ organizationId, productionFloorCode: "cnc", machineNumber: `NEW-FAMILY-${suffix}`,
      sourcePayload: { machineFamily: `NEW-FAMILY-${suffix}`, machineType: "CNC" },
    })
    const beforeFamilyChange = await pool.query(
      "SELECT machine_id, to_jsonb(session) AS snapshot FROM manufacturing.production_sessions session WHERE id = $1", [first.id]
    )
    await planning.upsertRouteOption({
      itemUid, organizationId, productionFloorCode: "cnc", routeCode: "CNC-1",
      machineFamily: `NEW-FAMILY-${suffix}`,
      replaceSetups: false, sourcePayload: { stageWeight: 475 },
      setups: [{ operationCode: "TURN", sequence: 1, setupNumber: 1 }],
    })
    expect((await pool.query(
      "SELECT machine_id, to_jsonb(session) AS snapshot FROM manufacturing.production_sessions session WHERE id = $1", [first.id]
    )).rows).toEqual(beforeFamilyChange.rows)
    expect((await pool.query(
      `SELECT state.machine_id FROM manufacturing.shop_floor_setup_state state
       JOIN manufacturing.production_sessions session ON session.work_order_id = state.work_order_id
         AND session.operation_setup_id = state.operation_setup_id
       WHERE session.id = $1 AND state.active`, [first.id]
    )).rows[0]?.machine_id).toBe(beforeFamilyChange.rows[0]?.machine_id)
    const closed = await repository.closeProductionSession({
      endCount: 10_850,
      endedAt: "2026-08-15T14:00:00+05:30",
      endReason: "shift_change",
      organizationId,
      sessionId: first.id,
    })
    expect(closed).toMatchObject({
      goodPieces: 843,
      rejectedPieces: 7,
      totalPieces: 850,
    })

    const rejections = createRejectionRepository({ pool })
    const registerFilter = { from: "2020-01-01", to: "2099-12-31", unit: "cnc" }
    const productionRejects = (await rejections.list(organizationId, registerFilter)).filter((row) => row.jobCard === cncJobCard)
    expect(productionRejects).toMatchObject([{ pieces: 7, kg: 3.423, type: "In-process", defect: "Visual defect", reason: "Segregated" }])
    const actor = (await pool.query<{ id: string }>("INSERT INTO identity.users(name,email) VALUES ('QC tester',$1) RETURNING id", [`qc-${randomUUID()}@example.test`])).rows[0]!.id
    const type = await quality.upsertRejectionType({ organizationId, code: "", name: `QC type ${suffix}`, payload: {} })
    const defect = await quality.upsertRejectionReason({ organizationId, code: "", name: `QC defect ${suffix}`, payload: {} })
    const reason = await quality.upsertRejectionRemark({ organizationId, code: "", remark: `QC reason ${suffix}`, payload: {} })
    const options = await rejections.entryOptions(organizationId, { unit: "cnc", part: itemUid, job: cncJobCard })
    expect(options.jobs).toHaveLength(1)
    const rejectionInput = { organizationId, userId: actor, requestId: randomUUID(), jobId: options.jobs[0]!.id,
      date: "2026-09-18", stage: "Checking", typeId: type.id, defectId: defect.id, reasonId: reason.id, pieces: 3, kg: 1.5 }
    await rejections.save(rejectionInput)
    await rejections.save(rejectionInput)
    await expect(rejections.save({ ...rejectionInput, stage: "Other" })).rejects.toThrow("Select Checking")
    const allRejects = (await rejections.list(organizationId, registerFilter)).filter((row) => row.jobCard === cncJobCard)
    expect(allRejects).toHaveLength(2)
    expect(allRejects.reduce((total, row) => total + row.pieces, 0)).toBe(10)
    expect(allRejects.find((row) => row.stage === "Checking")).toMatchObject({ pieces: 3, kg: 1.5, unit: "PPAC CNC-01" })

    const second = await repository.startProductionSession({
      jobCardNumber: cncJobCard,
      machineNumber: cncMachine,
      measurementMethod: "counter",
      operationSetupCode: "1",
      operatorCode: secondOperator,
      organizationId,
      pieceWeightGrams: 489,
      productionDate: "2026-08-15",
      productionFloorCode: "cnc",
      shift: "B",
      startedAt: "2026-08-15T14:00:00+05:30",
    })
    expect(second).toMatchObject({
      carriedFromSessionId: first.id,
      productionDate: "2026-08-15",
      sessionReference: `${cncMachine}-20260815-02`.toUpperCase(),
      shift: "B",
      startCount: 10_850,
    })

    const cycleSource = await pool.query<{ source_id: string }>(
      "SELECT source_id FROM manufacturing.operation_cycle_standards WHERE id = $1", [cycle.id]
    )
    await expect(planning.upsertCycleStandard({ ...cycleInput, rejectDuplicates: true }))
      .rejects.toThrow("already exists")
    await planning.upsertCycleStandard({
      ...cycleInput, cycleTimeSeconds: 30, recordId: cycleSource.rows[0]!.source_id,
      rejectDuplicates: true, setupTimeMinutes: undefined,
      sourcePayload: { partNo: itemUid, optionNumber: "CNC-1", setupNo: "1", cycleTime: 30 },
    })
    const retainedSettings = await pool.query(
      `SELECT setup_time_minutes::float8 AS minutes, (source_payload->>'pieceWeight')::int AS weight
       FROM manufacturing.operation_cycle_standards WHERE id = $1`, [cycle.id]
    )
    expect(retainedSettings.rows[0]).toEqual({ minutes: 12, weight: 489 })
    const revisedSessions = await pool.query<{
      id: string; cycle: number; entryCycle: number; target: number | null; good: number
    }>(
      `SELECT session.id, session.cycle_time_seconds::float8 AS cycle,
         session.piece_weight_grams::float8 AS weight,
         (entry.source_payload->>'cycleTime')::float8 AS "entryCycle",
         (entry.source_payload->>'targetQty')::int AS target, entry.quantity_good::float8 AS good
       FROM manufacturing.production_sessions session
       JOIN manufacturing.production_entries entry ON entry.id = session.production_entry_id
       WHERE session.id = ANY($1::uuid[])`, [[first.id, second.id]]
    )
    expect(revisedSessions.rows.find((row) => row.id === first.id))
      .toMatchObject({ cycle: 60, entryCycle: 60, target: 470, good: 843, weight: 489 })
    expect(revisedSessions.rows.find((row) => row.id === second.id))
      .toMatchObject({ cycle: 30, entryCycle: 30, good: 0, weight: 475 })

    const openDowntime = await repository.startProductionSessionDowntime({
      enteredRole: "machinist",
      organizationId,
      reasonCode: "DC-03",
      reasonName: "Tool change",
      sessionId: second.id,
      startedAt: "2026-08-15T14:15:00+05:30",
    })
    await expect(
      repository.endProductionSessionDowntime({
        endOutcome: "resolved",
        endedAt: "2026-08-15T14:20:00+05:30",
        organizationId,
        sessionId: second.id,
      })
    ).resolves.toMatchObject({ durationMinutes: 5, id: openDowntime.id })

    const sessions = await repository.readProductionSessions({
      organizationId,
      productionFloorCode: "cnc",
    })
    expect(sessions.rows.find((row) => row.id === first.id)).toMatchObject({
      downtimeMinutes: 10,
      goodPieces: 843,
      rejectedPieces: 7,
      sessionReference: `${cncMachine}-20260815-01`.toUpperCase(),
      shift: "A",
      status: "closed",
    })
    expect(sessions.rows.find((row) => row.id === second.id)).toMatchObject({
      downtimeMinutes: 5,
      startCount: 10_850,
      status: "open",
    })

    const events = await repository.readProductionSessionEvents({
      organizationId,
      productionFloorCode: "cnc",
      sessionId: second.id,
    })
    expect(events.rows.map((row) => row.eventType)).toEqual(
      expect.arrayContaining(["session_started", "downtime"])
    )

    const carriedDowntime = await repository.startProductionSessionDowntime({
      enteredRole: "machinist",
      organizationId,
      reasonCode: "DC-04",
      reasonName: "Bearing failure",
      sessionId: second.id,
      startedAt: "2026-08-15T14:30:00+05:30",
    })
    await expect(
      repository.closeProductionSession({
        endCount: 10_900,
        endedAt: "2026-08-15T15:00:00+05:30",
        endReason: "shift_end",
        organizationId,
        sessionId: second.id,
      })
    ).rejects.toThrow(
      "Close the open downtime before ending the production session."
    )
    await repository.endProductionSessionDowntime({
      endOutcome: "shift_end_unresolved",
      endedAt: "2026-08-15T15:00:00+05:30",
      organizationId,
      sessionId: second.id,
    })
    const carriedSession = await repository.readProductionSessions({
      organizationId,
      productionFloorCode: "cnc",
      sessionId: second.id,
    })
    expect(carriedSession.rows[0]?.downtimeEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endOutcome: "shift_end_unresolved",
          id: carriedDowntime.id,
        }),
      ])
    )

    await repository.closeProductionSession({
      endCount: 10_900,
      endedAt: "2026-08-15T15:00:00+05:30",
      endReason: "item_complete",
      organizationId,
      sessionId: second.id,
    })
    const closedTarget = await pool.query<{ target: number }>(
      `SELECT (entry.source_payload->>'targetQty')::int AS target
       FROM manufacturing.production_sessions session
       JOIN manufacturing.production_entries entry ON entry.id = session.production_entry_id
       WHERE session.id = $1`, [second.id]
    )
    expect(closedTarget.rows[0]?.target).toBe(50)
  })

  test("starts a session with an active operator from the central HR Employee Master", async () => {
    const department = await pool.query<{ id: string }>(
      `
        INSERT INTO recruitment.departments (
          organization_id, code, name, source_system, source_table, source_id
        ) VALUES ($1, 'PC0SF-2', 'Ppac Conventional-01 Shop Floor',
          'test', 'departments', $2)
        ON CONFLICT (organization_id, lower(code))
        DO UPDATE SET active = true
        RETURNING id
      `,
      [organizationId, randomUUID()]
    )
    const designation = await pool.query<{ id: string }>(
      `
        INSERT INTO recruitment.designations (
          organization_id, code, name, source_system, source_table, source_id
        ) VALUES ($1, 'WORKER', 'Worker', 'test', 'designations', $2)
        ON CONFLICT (organization_id, lower(code))
        DO UPDATE SET active = true
        RETURNING id
      `,
      [organizationId, randomUUID()]
    )
    await pool.query(
      `
        INSERT INTO recruitment.posts (
          organization_id, department_id, designation_id, vacancy_number,
          post_code, vacancy_code, employee_name, employee_code, status,
          source_system, source_table, source_id
        ) VALUES ($1, $2, $3, '1', $4, $4, 'HR Operator', $5,
          'Occupied', 'test', 'posts', $6)
      `,
      [
        organizationId,
        department.rows[0]!.id,
        designation.rows[0]!.id,
        `FLOOR-HR-POST-${suffix}`,
        hrOperator,
        randomUUID(),
      ]
    )
    await repository.recordShopFloorStage({
      jobCardNumber: firstJobCard,
      machineNumber: firstMachine,
      operationSetupCode: "1",
      organizationId,
      payload: { doneBy: "Machinist", partCode: itemUid },
      stage: "operator_started",
    })

    const session = await repository.startProductionSession({
      jobCardNumber: firstJobCard,
      machineNumber: firstMachine,
      measurementMethod: "weight",
      operationSetupCode: "1",
      operatorCode: hrOperator,
      organizationId,
      pieceWeightGrams: 15.4,
      productionDate: "2026-08-15",
      shift: "Day",
      startedAt: "2026-08-15T08:30:00+05:30",
    })
    const projected = await pool.query<{ active: boolean; employee_code: string }>(
      `
        SELECT employee_code, active
        FROM workforce.employees
        WHERE organization_id = $1 AND lower(employee_code) = lower($2)
      `,
      [organizationId, hrOperator]
    )

    expect(session.id).toBeTruthy()
    expect(projected.rows[0]).toEqual({ active: true, employee_code: hrOperator })
    await repository.closeProductionSession({
      crateCount: 0,
      crateWeightKg: 0,
      endedAt: "2026-08-15T09:30:00+05:30",
      endReason: "item_complete",
      grossWeightKg: 1,
      organizationId,
      sessionId: session.id,
    })
  })

  test("retains the source machine until an explicit planner switch and releases it on completion", async () => {
    await repository.recordShopFloorStage({
      jobCardNumber: firstJobCard,
      machineNumber: firstMachine,
      operationSetupCode: "1",
      organizationId,
      payload: { doneBy: "Stores", partCode: itemUid },
      stage: "raw_material_at_machine",
    })
    await repository.recordShopFloorStage({
      jobCardNumber: firstJobCard,
      machineNumber: firstMachine,
      operationSetupCode: "1",
      organizationId,
      payload: { doneBy: "Setter", partCode: itemUid },
      stage: "setting",
    })
    await expect(
      repository.recordShopFloorStage({
        jobCardNumber: firstJobCard,
        machineNumber: secondMachine,
        operationSetupCode: "1",
        organizationId,
        payload: { doneBy: "Setter", partCode: itemUid },
        stage: "operator_started",
      })
    ).rejects.toThrow(/planner.*machine switch/i)

    await planning.recordPlanOverride({
      fromMachineNumber: firstMachine,
      jobCardNumber: firstJobCard,
      organizationId,
      reason: "Approved machine switch",
      setupNumber: 1,
      toMachineNumber: secondMachine,
    })
    await repository.recordShopFloorStage({
      jobCardNumber: firstJobCard,
      machineNumber: secondMachine,
      operationSetupCode: "1",
      organizationId,
      payload: { doneBy: "OP-1", partCode: itemUid },
      stage: "operator_started",
    })
    await expect(
      repository.recordShopFloorStage({
        jobCardNumber: secondJobCard,
        machineNumber: secondMachine,
        operationSetupCode: "1",
        organizationId,
        payload: { doneBy: "OP-2", partCode: itemUid },
        stage: "raw_material_at_machine",
      })
    ).rejects.toThrow(/active setup/i)

    await repository.recordSetupCompletion({
      completedBy: "OP-1",
      jobCardNumber: firstJobCard,
      machineNumber: secondMachine,
      operationSetupCode: "1",
      organizationId,
      remark: "Setup complete",
    })
    await repository.recordShopFloorStage({
      jobCardNumber: secondJobCard,
      machineNumber: secondMachine,
      operationSetupCode: "1",
      organizationId,
      payload: { doneBy: "OP-2", partCode: itemUid },
      stage: "raw_material_at_machine",
    })

    const result = await pool.query<{
      active_machine: string
      completion_events: string
      first_active: boolean
      stage_events: string
    }>(
      `
        SELECT
          (SELECT active FROM manufacturing.shop_floor_setup_state state
            JOIN manufacturing.work_orders work_order ON work_order.id = state.work_order_id
            WHERE work_order.job_card_number = $1 AND state.operation_setup_id = (
              SELECT operation_setup_id FROM manufacturing.setup_completion_events completion
              WHERE completion.source_payload->>'jobCardNumber' = $1
              ORDER BY completion.completed_at DESC LIMIT 1
            )) AS first_active,
          (SELECT machine.machine_number FROM manufacturing.shop_floor_setup_state state
            JOIN manufacturing.work_orders work_order ON work_order.id = state.work_order_id
            JOIN catalog.machines machine ON machine.id = state.machine_id
            WHERE work_order.job_card_number = $2 AND state.active) AS active_machine,
          (SELECT count(*) FROM manufacturing.shop_floor_stage_events event
            JOIN manufacturing.shop_floor_setup_state state ON state.id = event.setup_state_id
            JOIN manufacturing.work_orders work_order ON work_order.id = state.work_order_id
            WHERE work_order.job_card_number = $1) AS stage_events,
          (SELECT count(*) FROM manufacturing.setup_completion_events
            WHERE source_payload->>'jobCardNumber' = $1) AS completion_events
      `,
      [firstJobCard, secondJobCard]
    )
    expect(result.rows[0]).toEqual({
      active_machine: secondMachine,
      completion_events: "1",
      first_active: false,
      stage_events: "4",
    })
  })

  test("records dispatch and reverses production without deleting evidence", async () => {
    await repository.recordDispatchApproval({
      approvedBy: "Dispatch lead",
      jobCardNumber: firstJobCard,
      organizationId,
      remark: "Approved after completion",
    })
    await repository.reverseProductionEntry({
      actorUserId: null,
      productionEntryId,
      reason: "Incorrect operator quantity",
    })

    const result = await pool.query<{
      dispatch_events: string
      outbox_events: string
      refresh_jobs: string
      reversal_reason: string
      reversed: boolean
    }>(
      `
        SELECT
          (SELECT count(*) FROM manufacturing.dispatch_approval_events
            WHERE source_payload->>'jobCardNumber' = $1) AS dispatch_events,
          (SELECT reversed_at IS NOT NULL FROM manufacturing.production_entries
            WHERE id = $2) AS reversed,
          (SELECT reversal_reason FROM manufacturing.production_entries
            WHERE id = $2) AS reversal_reason,
          (SELECT count(*) FROM derived.refresh_jobs
            WHERE organization_id = $3 AND queue_key = 'dashboard'
              AND status IN ('pending', 'running')) AS refresh_jobs,
          (SELECT count(*) FROM derived.outbox_events
            WHERE organization_id = $3
              AND topic = 'dashboard.refresh.requested') AS outbox_events
      `,
      [firstJobCard, productionEntryId, organizationId]
    )
    expect(result.rows[0]).toEqual({
      dispatch_events: "1",
      outbox_events: "1",
      refresh_jobs: "1",
      reversal_reason: "Incorrect operator quantity",
      reversed: true,
    })
  })

  test("uses the only active route when no explicit selection is required", async () => {
    await repository.recordShopFloorStage({
      jobCardNumber: thirdJobCard,
      machineNumber: firstMachine,
      operationSetupCode: "1",
      organizationId,
      payload: { doneBy: "Stores", partCode: itemUid },
      stage: "raw_material_at_machine",
    })

    const result = await pool.query<{
      active: boolean
      route_code: string
    }>(
      `
        SELECT state.active, route.route_code
        FROM manufacturing.shop_floor_setup_state state
        JOIN manufacturing.work_orders work_order
          ON work_order.id = state.work_order_id
        JOIN manufacturing.route_options route
          ON route.id = state.route_option_id
        WHERE work_order.job_card_number = $1
      `,
      [thirdJobCard]
    )

    expect(result.rows).toEqual([{ active: true, route_code: "1" }])

    await repository.recordSetupCompletion({
      completedBy: "Stores",
      jobCardNumber: thirdJobCard,
      machineNumber: firstMachine,
      operationSetupCode: "1",
      organizationId,
    })
  })
  test("refuses shared tooling already held by another setup until it completes", async () => {
    const machines = [`TOOL-MC-A-${suffix}`, `TOOL-MC-B-${suffix}`]
    for (const machineNumber of machines) await planning.upsertMachine({ organizationId, machineNumber })
    const jobs = [`TOOL-A-${suffix}`, `TOOL-B-${suffix}`]
    for (const jobCardNumber of jobs) {
      await planning.upsertWorkOrder({ organizationId, itemUid, jobCardNumber, workOrderNumber: jobCardNumber, orderedQuantity: 100 })
      await planning.selectRoute({ organizationId, jobCardNumber, routeCode: "1" })
    }
    const store = createStoreRepository({ connectionString })
    const category = await store.createAssetCategory({ organizationId, name: `Tool ${suffix}` })
    const subcategory = await store.createAssetSubcategory({ organizationId, categoryId: category.id, name: "Fixture" })
    const name = await store.createAssetName({ organizationId, subcategoryId: subcategory.id, name: "F1" })
    const item = await store.createItemType({ organizationId, assetType: "NON_CONSUMABLE", identificationName: "F1", unit: "Nos",
      assetCategoryId: category.id, assetSubcategoryId: subcategory.id, assetNameId: name.id })
    await store.close()
    const code = item.typeCode
    await pool.query(`INSERT INTO store.assets (organization_id,item_type_id,asset_code,identification_name,status,current_holder_type,current_holder_reference,current_holder_name)
      SELECT $1,$2,$3||n::text,'Tool unit',CASE WHEN n=1 THEN 'ASSIGNED' ELSE 'AVAILABLE' END,
        CASE WHEN n=1 THEN 'DEPARTMENT' ELSE 'STORE' END,'PPAC Conventional-01','PPAC Conventional-01'
      FROM generate_series(1,5) n`, [organizationId,item.id,code])
    await pool.query(`INSERT INTO manufacturing.operation_tooling (organization_id,operation_setup_id,tool_code,source_system,source_table,source_id)
      SELECT $1,setup.id,$2,'test','tooling',setup.id::text FROM manufacturing.operation_setups setup
      JOIN manufacturing.route_options route ON route.id=setup.route_option_id
      JOIN catalog.items item ON item.id=route.item_id
      WHERE item.uid=$3 AND route.route_code='1' AND setup.setup_number=1`, [organizationId,code,itemUid])
    const start = (jobCardNumber: string, machineNumber: string) => repository.recordShopFloorStage({
      jobCardNumber, machineNumber, operationSetupCode: "1", organizationId, stage: "presetting", payload: {},
    })
    await start(jobs[0]!, machines[0]!)
    await expect(start(jobs[1]!, machines[1]!)).rejects.toThrow("1 allocated to this department, 1 occupied")
    await repository.recordSetupCompletion({ jobCardNumber: jobs[0]!, machineNumber: machines[0]!,
      operationSetupCode: "1", organizationId, completedBy: "Test" })
    await expect(start(jobs[1]!, machines[1]!)).resolves.toBeDefined()
  })

})
