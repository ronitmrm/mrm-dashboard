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
const repository = createDashboardPlanningRepository({ connectionString })
const jobCards = createProductionShopFloorRepository({ connectionString })
let organizationId: string
let itemId: string
const suffix = randomUUID().slice(0, 8)
const itemUid = `PLAN-${suffix}`
const firstJobCard = `JC-${suffix}-1`
const secondJobCard = `JC-${suffix}-2`
const firstMachine = `MC-${suffix}-1`
const secondMachine = `MC-${suffix}-2`
const toolingAssetCode = `ST-TOOL-${suffix}`
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
  await pool.query(
    `INSERT INTO store.item_types (
       organization_id, type_code, asset_type, asset_category,
       asset_subcategory, asset_name, identification_name, tracking_mode,
       unit, asset_category_id, asset_subcategory_id, asset_name_id
     ) VALUES ($1, $2, 'NON_CONSUMABLE', $3, $4, $5, $6, 'SERIALIZED',
       'Nos', $7, $8, $9)`,
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
    ]
  )
})

afterAll(async () => {
  await jobCards.close()
  await repository.close()
  await pool.end()
})

describe("dashboard planning writes", () => {
  test("assigns only existing Store Asset Codes in Tooling Master", async () => {
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
        name: "Production Planning & Control Conventional-02",
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
      exceptionType: "holiday",
      name: "Independence Day",
      organizationId,
      workingMinutes: 0,
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
            WHERE organization_id = $3 AND queue_key = 'dashboard') AS jobs,
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

    await pool.query(
      `
        UPDATE manufacturing.production_entries
        SET quantity_good = 40, completed_at = '2026-08-16T16:00:00+05:30'
        WHERE id = $1;
        UPDATE manufacturing.production_sessions
        SET status = 'closed', ended_at = '2026-08-16T16:00:00+05:30',
          end_reason = 'manual_stop', gross_weight_kg = 0.616,
          net_weight_kg = 0.616, total_pieces = 40, quantity_good = 40,
          updated_at = now()
        WHERE id = $2
      `,
      [productionEntryId, sessionId]
    )
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

  test("rejects a plan override while the target physical machine is locked by another active setup", async () => {
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
      [organizationId, secondMachine, secondJobCard]
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

    await expect(
      repository.recordPlanOverride({
        fromMachineNumber: firstMachine,
        jobCardNumber: firstJobCard,
        organizationId,
        reason: "Unsafe move",
        setupNumber: 1,
        toMachineNumber: secondMachine,
      })
    ).rejects.toThrow("active setup")
  })
})
