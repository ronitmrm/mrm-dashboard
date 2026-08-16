import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createDashboardPlanningRepository } from "./dashboard-planning"
import { createMaintenanceRepository } from "./maintenance"
import { migrateDatabase } from "./migrate"
import { createQualityRepository } from "./quality"
import { createWorkforceRepository } from "./workforce"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const planning = createDashboardPlanningRepository({ connectionString })
const workforce = createWorkforceRepository({ connectionString })
const quality = createQualityRepository({ connectionString })
const maintenance = createMaintenanceRepository({ connectionString })
const suffix = randomUUID().slice(0, 8)
const employeeCode = `EMP-${suffix}`
const trainerCode = `TRN-${suffix}`
const itemUid = `SUPPORT-${suffix}`
const jobCardNumber = `SUPPORT-JC-${suffix}`
const machineNumber = `SUPPORT-MC-${suffix}`
let organizationId: string

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
  await workforce.upsertEmployee({
    employeeCode,
    name: "Support operator",
    organizationId,
  })
  await workforce.upsertEmployee({
    employeeCode: trainerCode,
    name: "Support trainer",
    organizationId,
  })
  await planning.upsertMachine({ machineNumber, organizationId })
  await planning.upsertWorkOrder({
    itemUid,
    jobCardNumber,
    orderedQuantity: 100,
    organizationId,
    workOrderNumber: `SUPPORT-WO-${suffix}`,
  })
  await planning.upsertRouteOption({
    itemUid,
    organizationId,
    routeCode: "1",
    setups: [
      {
        legacySetupCode: "1.1",
        operationCode: "INSPECT",
        sequence: 1,
        setupNumber: 1,
      },
    ],
  })
  await planning.selectRoute({
    jobCardNumber,
    organizationId,
    routeCode: "1",
  })
})

afterAll(async () => {
  await workforce.close()
  await quality.close()
  await maintenance.close()
  await planning.close()
  await pool.end()
})

describe("workforce, quality, and maintenance workflows", () => {
  test("keeps workforce writes traceable while projecting one attendance state", async () => {
    const attendance = await workforce.recordAttendance({
      attendanceDate: "2026-07-21",
      employeeCode,
      organizationId,
      payload: { source: "clock", status: "Present" },
      shift: "A",
      status: "Present",
    })
    const sameAttendance = await workforce.recordAttendance({
      attendanceDate: "2026-07-21",
      employeeCode,
      organizationId,
      payload: { source: "supervisor", status: "Late" },
      shift: "A",
      status: "Late",
    })
    expect(sameAttendance.id).toBe(attendance.id)

    await workforce.recordTraining({
      durationMinutes: 45,
      employeeCode,
      organizationId,
      payload: { competency: "Setup" },
      result: "Completed",
      topic: "Setup safety",
      trainerEmployeeCode: trainerCode,
      trainingDate: "2026-07-21",
    })

    const result = await pool.query<{
      attendance_events: string
      attendance_rows: string
      status: string
      training_rows: string
    }>(
      `
        SELECT
          (SELECT count(*) FROM workforce.attendance_records record
            JOIN workforce.employees employee ON employee.id = record.employee_id
            WHERE employee.organization_id = $1 AND employee.employee_code = $2
              AND record.attendance_date = DATE '2026-07-21'
              AND record.shift = 'A') AS attendance_rows,
          (SELECT status FROM workforce.attendance_records record
            JOIN workforce.employees employee ON employee.id = record.employee_id
            WHERE employee.organization_id = $1 AND employee.employee_code = $2
              AND record.attendance_date = DATE '2026-07-21'
              AND record.shift = 'A') AS status,
          (SELECT count(*) FROM workforce.attendance_record_events event
            WHERE event.attendance_record_id = $3) AS attendance_events,
          (SELECT count(*) FROM workforce.training_records training
            JOIN workforce.employees employee ON employee.id = training.employee_id
            WHERE employee.organization_id = $1 AND employee.employee_code = $2
              AND training.topic = 'Setup safety') AS training_rows
      `,
      [organizationId, employeeCode, attendance.id]
    )
    expect(result.rows[0]).toEqual({
      attendance_events: "2",
      attendance_rows: "1",
      status: "Late",
      training_rows: "1",
    })
  })

  test("normalizes quality masters, five-sample reports, hourly readings, and two-phase setup checklists", async () => {
    const parameter = await quality.upsertParameterDefinition({
      dataType: "numeric",
      inputType: "number",
      itemUid,
      lowerLimit: 9.8,
      name: "Total length",
      nominalValue: 10,
      operationSetupCode: "1.1",
      organizationId,
      parameterCode: "LEN",
      payload: {
        specification: "10.00",
        toleranceMinus: 0.2,
        tolerancePlus: 0.2,
      },
      routeCode: "1",
      sequence: 1,
      upperLimit: 10.2,
    })

    const inspection = await quality.recordFirstPieceInspection({
      approvedBy: "QC-1",
      dimensions: [
        {
          parameterCode: "LEN",
          readings: [10, 10.1, 9.9, 10.2, 9.8],
        },
      ],
      inspectionKey: `FPIR-${suffix}`,
      inspectedAt: "2026-07-21T09:00:00.000Z",
      jobCardNumber,
      machineNumber,
      operationSetupCode: "1.1",
      organizationId,
      payload: { reportId: `FPIR-${suffix}` },
      status: "Approved",
    })
    const sameInspection = await quality.recordFirstPieceInspection({
      approvedBy: "QC-1",
      dimensions: [
        {
          parameterCode: "LEN",
          readings: [10, 10.1, 9.9, 10.2, 9.8],
        },
      ],
      inspectionKey: `FPIR-${suffix}`,
      inspectedAt: "2026-07-21T09:00:00.000Z",
      jobCardNumber,
      machineNumber,
      operationSetupCode: "1.1",
      organizationId,
      payload: { reportId: `FPIR-${suffix}`, remark: "Checked" },
      status: "Approved",
    })
    expect(sameInspection.id).toBe(inspection.id)

    await quality.recordHourlyCheck({
      checkKey: `HOURLY-${suffix}`,
      checkedAt: "2026-07-21T10:00:00.000Z",
      checkedBy: "QC-2",
      jobCardNumber,
      machineNumber,
      operationSetupCode: "1.1",
      organizationId,
      payload: { hourSlot: "10:00-11:00" },
      readings: [
        {
          actualReading: "10.05",
          parameterCode: "LEN",
          result: "OK",
        },
      ],
      status: "OK",
    })

    const template = await quality.upsertSetupChecklistTemplate({
      code: `SETUP-${suffix}`,
      items: [
        {
          inputType: "checkbox",
          itemKey: "drawing",
          prompt: "Drawing checked",
          required: true,
          sequence: 1,
        },
        {
          inputType: "text",
          itemKey: "note",
          prompt: "Setting note",
          required: false,
          sequence: 2,
        },
      ],
      name: "Setup checklist",
      organizationId,
      payload: { version: `SETUP-${suffix}` },
      revision: 1,
    })
    const session = await quality.saveSetupChecklistSession({
      completedBy: "SETTER-1",
      jobCardNumber,
      machineNumber,
      operationSetupCode: "1.1",
      organizationId,
      payload: { phase: "start" },
      phase: "start",
      results: [
        {
          itemKey: "1|Drawing checked",
          itemPrompt: "Drawing checked",
          sequence: 1,
          value: true,
        },
        { itemKey: "note", value: "Ready" },
      ],
      sessionKey: `SESSION-${suffix}`,
      status: "In progress",
      templateCode: `SETUP-${suffix}`,
    })
    const sameSession = await quality.saveSetupChecklistSession({
      completedBy: "SETTER-1",
      completedAt: "2026-07-21T11:00:00.000Z",
      jobCardNumber,
      machineNumber,
      operationSetupCode: "1.1",
      organizationId,
      payload: { phase: "end" },
      phase: "end",
      results: [
        {
          itemKey: "1|Drawing checked",
          itemPrompt: "Drawing checked",
          sequence: 1,
          value: true,
        },
        { itemKey: "note", value: "Complete" },
      ],
      sessionKey: `SESSION-${suffix}`,
      status: "Completed",
      templateCode: `SETUP-${suffix}`,
    })
    expect(sameSession.id).toBe(session.id)

    const hourlyPage = await quality.readHourlyQualityPage({
      checkKey: `HOURLY-${suffix}`,
      organizationId,
    })
    expect(Array.isArray(hourlyPage.runningRows)).toBe(true)
    expect(hourlyPage.qualityParameterMasterRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "LEN",
          partNo: itemUid,
          setupNo: "1.1",
        }),
      ])
    )
    expect(hourlyPage.existingCheck).toEqual(
      expect.objectContaining({
        checkId: `HOURLY-${suffix}`,
        readings: [
          expect.objectContaining({
            actualReading: "10.05",
            code: "LEN",
            result: "OK",
          }),
        ],
      })
    )

    const setupPage = await quality.readSetupChecklistPage({
      organizationId,
      sessionKey: `SESSION-${suffix}`,
    })
    expect(setupPage.setupChecklistMasterRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkPoint: "Drawing checked",
          inputType: "checkbox",
          status: "Active",
        }),
      ])
    )
    expect(setupPage.setupChecklistSession).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({ startValue: true, endValue: true }),
          expect.objectContaining({
            startValue: "Ready",
            endValue: "Complete",
          }),
        ],
        sessionId: `SESSION-${suffix}`,
        status: "Completed",
      })
    )

    const result = await pool.query<{
      first_piece_readings: string
      first_piece_samples: string
      hourly_readings: string
      parameter_id: string
      setup_results: string
      setup_status: string
      template_id: string
    }>(
      `
        SELECT
          $1::text AS parameter_id,
          $2::text AS template_id,
          (SELECT count(*) FROM quality.first_piece_readings
            WHERE inspection_id = $3) AS first_piece_readings,
          (SELECT count(*) FROM quality.first_piece_reading_samples sample
            JOIN quality.first_piece_readings reading ON reading.id = sample.reading_id
            WHERE reading.inspection_id = $3) AS first_piece_samples,
          (SELECT count(*) FROM quality.hourly_check_readings reading
            JOIN quality.hourly_checks check_row ON check_row.id = reading.hourly_check_id
            WHERE check_row.organization_id = $4
              AND check_row.check_key = $5) AS hourly_readings,
          (SELECT count(*) FROM quality.setup_checklist_results
            WHERE session_id = $6) AS setup_results,
          (SELECT status FROM quality.setup_checklist_sessions
            WHERE id = $6) AS setup_status
      `,
      [
        parameter.id,
        template.id,
        inspection.id,
        organizationId,
        `HOURLY-${suffix}`,
        session.id,
      ]
    )
    expect(result.rows[0]).toEqual({
      first_piece_readings: "1",
      first_piece_samples: "5",
      hourly_readings: "1",
      parameter_id: parameter.id,
      setup_results: "4",
      setup_status: "Completed",
      template_id: template.id,
    })
  })

  test("uses the only active route for quality writes and rejects duplicate parameter specifications", async () => {
    const automaticItemUid = `AUTO-QUALITY-${suffix}`
    const automaticJobCard = `AUTO-QUALITY-JC-${suffix}`
    await pool.query(
      `
        INSERT INTO catalog.items (
          organization_id, uid, uid_kind, lifecycle_status, description,
          item_type, source_system, source_table, source_id
        ) VALUES ($1, $2, 'INTERNAL', 'M', $2, 'List', 'test', 'items', $3)
      `,
      [organizationId, automaticItemUid, randomUUID()]
    )
    await planning.upsertWorkOrder({
      itemUid: automaticItemUid,
      jobCardNumber: automaticJobCard,
      orderedQuantity: 10,
      organizationId,
      workOrderNumber: `AUTO-QUALITY-WO-${suffix}`,
    })
    await planning.upsertRouteOption({
      itemUid: automaticItemUid,
      organizationId,
      routeCode: "1",
      setups: [
        {
          legacySetupCode: "1",
          operationCode: "VISUAL",
          sequence: 1,
          setupNumber: 1,
        },
      ],
    })
    await quality.upsertParameterDefinition({
      dataType: "boolean",
      inputType: "pass_fail",
      itemUid: automaticItemUid,
      name: "Surface condition",
      operationSetupCode: "1",
      organizationId,
      parameterCode: "VISUAL-1",
      payload: { specification: "OK", tolerancePlus: "OK", toleranceMinus: "Not OK" },
      routeCode: "1",
      sequence: 1,
    })

    await expect(
      quality.upsertParameterDefinition({
        dataType: "boolean",
        inputType: "pass_fail",
        itemUid: automaticItemUid,
        name: "Surface condition",
        operationSetupCode: "1",
        organizationId,
        parameterCode: "VISUAL-2",
        payload: { specification: "OK" },
        routeCode: "1",
        sequence: 2,
      })
    ).rejects.toThrow("already exists")

    const inspection = await quality.recordFirstPieceInspection({
      approvedBy: "QC-1",
      dimensions: [
        {
          parameterCode: "VISUAL-1",
          readings: ["OK", "Not OK", "OK", "OK", "OK"],
        },
      ],
      inspectionKey: `AUTO-FPIR-${suffix}`,
      inspectedAt: "2026-08-15T09:00:00.000Z",
      jobCardNumber: automaticJobCard,
      machineNumber,
      operationSetupCode: "1",
      organizationId,
      payload: { reportId: `AUTO-FPIR-${suffix}` },
      status: "Approved",
    })
    const result = await pool.query<{ result: string }>(
      "SELECT result FROM quality.first_piece_readings WHERE inspection_id = $1",
      [inspection.id]
    )
    expect(result.rows).toEqual([{ result: "Not OK" }])
  })

  test("preserves the three standalone legacy rejection masters", async () => {
    const rejectionType = await quality.upsertRejectionType({
      code: `TYPE-${suffix}`,
      name: "Surface defect",
      organizationId,
      payload: { code: `TYPE-${suffix}`, typeOfRejection: "Surface defect" },
    })
    const rejectionReason = await quality.upsertRejectionReason({
      code: `REASON-${suffix}`,
      name: "Tool mark",
      organizationId,
      payload: { code: `REASON-${suffix}`, rejectionReason: "Tool mark" },
    })
    const rejectionRemark = await quality.upsertRejectionRemark({
      code: `REMARK-${suffix}`,
      organizationId,
      payload: { code: `REMARK-${suffix}`, rejectionRemark: "Rework allowed" },
      remark: "Rework allowed",
    })

    expect(rejectionType.id).toEqual(expect.any(String))
    expect(rejectionReason.id).toEqual(expect.any(String))
    expect(rejectionRemark.id).toEqual(expect.any(String))
    const rows = await pool.query<{ count: string }>(
      `
        SELECT (
          (SELECT count(*) FROM quality.rejection_types
            WHERE organization_id = $1 AND code = $2) +
          (SELECT count(*) FROM quality.rejection_reasons
            WHERE organization_id = $1 AND code = $3) +
          (SELECT count(*) FROM quality.rejection_remarks
            WHERE organization_id = $1 AND code = $4)
        )::text AS count
      `,
      [
        organizationId,
        `TYPE-${suffix}`,
        `REASON-${suffix}`,
        `REMARK-${suffix}`,
      ]
    )
    expect(rows.rows[0]?.count).toBe("3")
  })

  test("reuses generated codes for repeated CSV master entries", async () => {
    const typeName = `CSV rejection ${suffix}`
    const legacyType = await quality.upsertRejectionType({
      code: `R-${suffix}`,
      name: typeName,
      organizationId,
      payload: { code: `R-${suffix}`, typeOfRejection: typeName },
    })
    const firstType = await quality.upsertRejectionType({
      code: "",
      name: typeName,
      organizationId,
      payload: { typeOfRejection: typeName },
    })
    const repeatedType = await quality.upsertRejectionType({
      code: "",
      name: typeName,
      organizationId,
      payload: { typeOfRejection: typeName },
    })

    const setupTitle = `CSV setup ${suffix}`
    const firstSetup = await quality.upsertSetupChecklistTemplate({
      code: "",
      items: [{
        inputType: "checkbox",
        itemKey: "1|Drawing",
        prompt: "Drawing",
        required: true,
        sequence: 1,
      }],
      name: setupTitle,
      organizationId,
      payload: { checklistTitle: setupTitle },
      revision: 1,
    })
    const repeatedSetup = await quality.upsertSetupChecklistTemplate({
      code: "",
      items: [{
        inputType: "checkbox",
        itemKey: "2|Tooling",
        prompt: "Tooling",
        required: true,
        sequence: 2,
      }],
      name: setupTitle,
      organizationId,
      payload: { checklistTitle: setupTitle },
      revision: 1,
    })

    const maintenanceTitle = `CSV maintenance ${suffix}`
    const firstMaintenance = await maintenance.upsertChecklistItem({
      checklistCode: "",
      checklistTitle: maintenanceTitle,
      item: {
        inputType: "checkbox",
        itemKey: "1",
        prompt: "Clean",
        required: true,
        sequence: 1,
      },
      organizationId,
      payload: { checklistTitle: maintenanceTitle },
    })
    const repeatedMaintenance = await maintenance.upsertChecklistItem({
      checklistCode: "",
      checklistTitle: maintenanceTitle,
      item: {
        inputType: "checkbox",
        itemKey: "2",
        prompt: "Lubricate",
        required: true,
        sequence: 2,
      },
      organizationId,
      payload: { checklistTitle: maintenanceTitle },
    })

    expect(firstType.code).not.toBe(legacyType.code)
    expect(firstType.code).toMatch(/^RT\d+$/)
    expect(repeatedType).toEqual(firstType)
    expect(repeatedSetup).toEqual(firstSetup)
    expect(repeatedMaintenance.code).toBe(firstMaintenance.code)
  })

  test("ties planned and breakdown maintenance history to physical machines and checklist results", async () => {
    const definition = await maintenance.upsertDefinition({
      checklistCode: `MAINT-${suffix}`,
      code: `MAINT-${suffix}`,
      estimatedMinutes: 60,
      frequencyBasis: "Calendar days",
      frequencyDays: 30,
      items: [
        {
          inputType: "checkbox",
          itemKey: "oil",
          prompt: "Oil checked",
          required: true,
          sequence: 1,
        },
        {
          inputType: "text",
          itemKey: "bearing",
          prompt: "Bearing condition",
          required: true,
          sequence: 2,
        },
      ],
      name: "Monthly maintenance",
      organizationId,
      payload: { source: "master" },
    })
    const schedule = await maintenance.upsertMachineSchedule({
      definitionCode: `MAINT-${suffix}`,
      machineNumber,
      nextDueOn: "2026-07-21",
      organizationId,
      payload: { firstDueDate: "2026-07-21" },
      scheduleKey: `${machineNumber}|MAINT-${suffix}`,
    })
    await maintenance.upsertChecklistItem({
      checklistCode: `MAINT-${suffix}`,
      checklistTitle: "Monthly maintenance",
      item: {
        active: false,
        inputType: "text",
        itemKey: `MAINT-${suffix}|3`,
        prompt: "Archived note",
        required: false,
        sequence: 3,
      },
      organizationId,
      payload: { status: "Inactive" },
    })
    const task = await maintenance.completeTask({
      completedAt: "2026-07-21T12:00:00.000Z",
      completedBy: "TECH-1",
      dueOn: "2026-07-21",
      machineNumber,
      nextDueOn: "2026-08-20",
      organizationId,
      payload: { actualMinutes: 55, workDone: "Serviced" },
      results: [
        {
          itemKey: `MAINT-${suffix}|1`,
          itemPrompt: "Oil checked",
          sequence: 1,
          value: true,
        },
        { itemKey: "bearing", value: "Good" },
      ],
      scheduleKey: `${machineNumber}|MAINT-${suffix}`,
      taskKey: `TASK-${suffix}`,
      taskType: "Planned",
    })
    const sameTask = await maintenance.completeTask({
      completedAt: "2026-07-21T12:00:00.000Z",
      completedBy: "TECH-1",
      dueOn: "2026-07-21",
      machineNumber,
      nextDueOn: "2026-08-20",
      organizationId,
      payload: { actualMinutes: 55, workDone: "Serviced" },
      results: [
        {
          itemKey: `MAINT-${suffix}|1`,
          itemPrompt: "Oil checked",
          sequence: 1,
          value: true,
        },
        { itemKey: "bearing", value: "Good" },
      ],
      scheduleKey: `${machineNumber}|MAINT-${suffix}`,
      taskKey: `TASK-${suffix}`,
      taskType: "Planned",
    })
    expect(sameTask.id).toBe(task.id)

    await maintenance.completeBreakdownTask({
      completedAt: "2026-07-21T13:00:00.000Z",
      completedBy: "TECH-2",
      machineNumber,
      organizationId,
      payload: { breakdownReason: "Bearing", workDone: "Replaced" },
      taskKey: `BREAKDOWN-${suffix}`,
    })

    const result = await pool.query<{
      breakdown_tasks: string
      definition_id: string
      inactive_checklist_items: string
      next_due_on: string
      planned_results: string
      planned_tasks: string
      schedule_id: string
    }>(
      `
        SELECT
          $1::text AS definition_id,
          $2::text AS schedule_id,
          (SELECT count(*) FROM maintenance.tasks
            WHERE organization_id = $3 AND task_key = $4) AS planned_tasks,
          (SELECT count(*) FROM maintenance.task_results
            WHERE task_id = $5::uuid) AS planned_results,
          (SELECT next_due_on::text FROM maintenance.machine_schedules
            WHERE id = $2::uuid) AS next_due_on,
          (SELECT count(*) FROM maintenance.tasks
            WHERE organization_id = $3 AND task_key = $6
              AND task_type = 'Breakdown') AS breakdown_tasks,
          (SELECT count(*) FROM maintenance.checklist_items item
            WHERE item.definition_id = $1::uuid AND NOT item.active)
            AS inactive_checklist_items
      `,
      [
        definition.id,
        schedule.id,
        organizationId,
        `TASK-${suffix}`,
        task.id,
        `BREAKDOWN-${suffix}`,
      ]
    )
    expect(result.rows[0]).toEqual({
      breakdown_tasks: "1",
      definition_id: definition.id,
      inactive_checklist_items: "1",
      next_due_on: "2026-08-20",
      planned_results: "2",
      planned_tasks: "1",
      schedule_id: schedule.id,
    })
  })
})
