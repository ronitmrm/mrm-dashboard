import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createDashboardPlanningRepository } from "./dashboard-planning"
import { migrateDatabase } from "./migrate"
import { createProductionShopFloorRepository } from "./production-shop-floor"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const planning = createDashboardPlanningRepository({ connectionString })
const repository = createProductionShopFloorRepository({ connectionString })
const suffix = randomUUID().slice(0, 8)
const itemUid = `FLOOR-${suffix}`
const firstJobCard = `FLOOR-JC-${suffix}-1`
const secondJobCard = `FLOOR-JC-${suffix}-2`
const firstMachine = `FLOOR-MC-${suffix}-1`
const secondMachine = `FLOOR-MC-${suffix}-2`
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
      INSERT INTO catalog.items (
        organization_id, uid, uid_kind, lifecycle_status, description,
        item_type, source_system, source_table, source_id
      )
      VALUES ($1, $2, 'INTERNAL', 'M', $2, 'List', 'test', 'items', $3)
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
  for (const [index, jobCardNumber] of [
    firstJobCard,
    secondJobCard,
  ].entries()) {
    await planning.upsertWorkOrder({
      itemUid,
      jobCardNumber,
      orderedQuantity: 100,
      organizationId,
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
})

afterAll(async () => {
  await planning.close()
  await repository.close()
  await pool.end()
})

describe("production and shop-floor workflows", () => {
  test("keeps the production-card merge behavior and records append-only production", async () => {
    const receipt = await repository.upsertRawMaterialReceipt({
      organizationId,
      payload: {
        jcNo: firstJobCard,
        rmPoNo: `RM-${suffix}`,
        status: "Received",
      },
      quantityKg: 125.5,
      receiptNumber: `RM-${suffix}`,
      receivedOn: "2026-07-20",
    })
    const sameReceipt = await repository.upsertRawMaterialReceipt({
      organizationId,
      payload: {
        jcNo: firstJobCard,
        remark: "Weighed",
        rmPoNo: `RM-${suffix}`,
      },
      quantityKg: 126,
      receiptNumber: `RM-${suffix}`,
      receivedOn: "2026-07-20",
    })
    expect(sameReceipt.id).toBe(receipt.id)

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
    })
    productionEntryId = production.id

    const result = await pool.query<{
      card_events: string
      cards: string
      output_qty: string
      production_entries: string
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
              AND source_payload->>'remark' = 'Weighed') AS raw_material_receipts
      `,
      [organizationId, `CARD-${suffix}`, productionEntryId, `RM-${suffix}`]
    )
    expect(result.rows[0]).toEqual({
      card_events: "2",
      cards: "1",
      output_qty: "10",
      production_entries: "1",
      raw_material_receipts: "1",
      remarks: "Updated card",
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
})
