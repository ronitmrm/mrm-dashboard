import { describe, expect, test } from "vitest"

import { operationalEntryPlan } from "./postgres-operational-entry"

describe("PostgreSQL operational entry mapping", () => {
  test("preserves numeric quality tolerances and five first-piece samples", () => {
    expect(
      operationalEntryPlan("quality_parameter_master", {
        partNo: "M18",
        optionNumber: "1",
        setupNo: "1",
        code: "LEN",
        parameterName: "Total length",
        specification: "15",
        tolerancePlus: "0.15",
        toleranceMinus: "0.10",
        inputType: "number",
        sequence: 1,
        status: "Active",
      })
    ).toMatchObject({
      capability: "quality.parameters.manage",
      family: "quality",
      operation: "parameter",
      input: {
        dataType: "numeric",
        itemUid: "M18",
        lowerLimit: 14.9,
        nominalValue: 15,
        parameterCode: "LEN",
        upperLimit: 15.15,
      },
    })

    expect(
      operationalEntryPlan("first_piece_inspection_report", {
        reportId: "JC-12|M18|1|1|ADB901|FPI",
        jcNo: "JC-12",
        setupNo: "1",
        machine: "ADB901",
        taskCompletedAt: "2026-07-21T09:00:00.000Z",
        dimensions: [
          {
            uid: "M18",
            description: "Total length",
            readings: [14.9, 15, 15.1, 15.05, 14.95],
          },
        ],
      })
    ).toMatchObject({
      capability: "quality.first_piece.write",
      family: "quality",
      operation: "first-piece",
      input: {
        dimensions: [
          {
            parameterCode: "M18",
            parameterName: "Total length",
            readings: [14.9, 15, 15.1, 15.05, 14.95],
          },
        ],
        inspectionKey: "JC-12|M18|1|1|ADB901|FPI",
      },
    })
  })

  test("keeps both setup checklist phases and their original value types", () => {
    expect(
      operationalEntryPlan("setup_checklist_session", {
        sessionId: "JC-9|M15|1|2|TR506",
        jcNo: "JC-9",
        setupNo: "2",
        machine: "TR506",
        masterVersion: "20260702",
        status: "Completed",
        startedBy: "MACH-1",
        startedAt: "2026-07-21T08:00:00.000Z",
        endedBy: "MACH-2",
        endedAt: "2026-07-21T09:00:00.000Z",
        items: [
          {
            sequence: 1,
            checkPoint: "Drawing checked",
            section: "Pre setting",
            inputType: "checkbox",
            startValue: "Yes",
            startItemRemark: "Drawing available",
          },
          {
            sequence: 2,
            checkPoint: "Setting note",
            section: "Setting",
            inputType: "text",
            endValue: "Complete",
            endItemRemark: "Setting verified",
          },
        ],
      })
    ).toMatchObject({
      capability: "quality.setup_checklist.write",
      family: "quality",
      operation: "setup-session",
      phases: [
        {
          input: {
            completedBy: "MACH-1",
            phase: "start",
            results: [
              {
                itemKey: "1|Drawing checked",
                notes: "Drawing available",
                value: true,
              },
            ],
          },
        },
        {
          input: {
            completedBy: "MACH-2",
            phase: "end",
            results: [
              {
                itemKey: "2|Setting note",
                notes: "Setting verified",
                value: "Complete",
              },
            ],
          },
        },
      ],
    })
  })

  test("uses the generated checklist code for setup checklist masters and sessions", () => {
    expect(
      operationalEntryPlan("setup_checklist_master", {
        checklistCode: "SC001",
        checklistTitle: "Machinist setup checks",
        sequence: 1,
        checkPoint: "Drawing checked",
        inputType: "checkbox",
        required: "Yes",
      })
    ).toMatchObject({
      operation: "setup-template",
      input: {
        code: "SC001",
        name: "Machinist setup checks",
      },
    })

    expect(
      operationalEntryPlan("setup_checklist_session", {
        sessionId: "JC-9|M15|1|2|TR506",
        jcNo: "JC-9",
        setupNo: "2",
        checklistCode: "SC001",
        items: [{ sequence: 1, checkPoint: "Drawing checked", startValue: "Yes" }],
      })
    ).toMatchObject({
      phases: [{ input: { templateCode: "SC001" } }],
    })
  })

  test("preserves planned and breakdown maintenance task semantics", () => {
    expect(
      operationalEntryPlan("maintenance_task", {
        taskId: "A304|MC001|2026-07-21",
        maintenanceType: "Planned",
        scheduleKey: "A304|MC001",
        machineNo: "A304",
        completedDate: "2026-07-21",
        completedAt: "2026-07-21T12:00:00.000Z",
        completedBy: "TECH-1",
        nextDueDate: "2026-08-20",
        checklistSteps: [
          {
            checklistCode: "MC001",
            sequence: 1,
            stepDescription: "Clean chuck",
            value: "OK",
            result: "OK",
          },
        ],
      })
    ).toMatchObject({
      capability: "maintenance.tasks.write",
      family: "maintenance",
      operation: "planned-task",
      input: {
        results: [
          {
            itemKey: "MC001|1",
            itemPrompt: "Clean chuck",
            passed: true,
            sequence: 1,
            value: "OK",
          },
        ],
        taskType: "Planned",
      },
    })

    expect(
      operationalEntryPlan("maintenance_task", {
        taskId: "A304|BREAKDOWN|2026-07-21",
        maintenanceType: "Breakdown",
        machineNo: "A304",
        completedAt: "2026-07-21T13:00:00.000Z",
        completedBy: "TECH-2",
        breakdownReason: "Bearing",
      })
    ).toMatchObject({
      operation: "breakdown-task",
      input: { machineNumber: "A304" },
    })
  })

  test("maps employee, attendance, and training entries without merging event history", () => {
    expect(
      operationalEntryPlan("employee", {
        empId: 124,
        employeeName: "Gilgal Nayana",
        employeeType: "Worker",
        doj: "2020-01-01",
        status: "Active",
      })
    ).toMatchObject({
      capability: "hr.employees.write",
      family: "workforce",
      operation: "employee",
      input: { employeeCode: "124", name: "Gilgal Nayana" },
    })
    expect(
      operationalEntryPlan("attendance_record", {
        empId: "124",
        attendanceDate: "2026-07-21",
        shift: "Day",
        status: "Late",
      })
    ).toMatchObject({
      capability: "operations.attendance.write",
      operation: "attendance",
    })
    expect(
      operationalEntryPlan("training_record", {
        empId: "124",
        trainingDate: "2026-07-21",
        topic: "Setup safety",
      })
    ).toMatchObject({
      capability: "operations.training.write",
      operation: "training",
    })
  })

  test("maps all standalone rejection masters to PostgreSQL quality operations", () => {
    expect(
      operationalEntryPlan("rejection_type_master", {
        code: "SURFACE",
        typeOfRejection: "Surface defect",
        status: "Active",
      })
    ).toMatchObject({
      capability: "quality.parameters.manage",
      family: "quality",
      operation: "rejection-type",
      input: { code: "SURFACE", name: "Surface defect" },
    })
    expect(
      operationalEntryPlan("rejection_reason_master", {
        code: "TOOL-MARK",
        rejectionReason: "Tool mark",
      })
    ).toMatchObject({
      operation: "rejection-reason",
      input: { code: "TOOL-MARK", name: "Tool mark" },
    })
    expect(
      operationalEntryPlan("rejection_remark_master", {
        code: "REWORK",
        rejectionRemark: "Rework allowed",
      })
    ).toMatchObject({
      operation: "rejection-remark",
      input: { code: "REWORK", remark: "Rework allowed" },
    })
  })
})
