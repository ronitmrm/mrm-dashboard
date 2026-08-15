import { setupChecklistItemAppliesToPhase } from "./shop-floor-workflow"

type Payload = Record<string, unknown>
type EntryValue = boolean | number | string | null

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim()
}

function optionalText(value: unknown) {
  return text(value) || undefined
}

function numberOrUndefined(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function record(value: unknown): Payload {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Payload)
    : {}
}

function records(value: unknown) {
  return Array.isArray(value) ? value.map(record) : []
}

function entryValues(value: unknown): EntryValue[] {
  return Array.isArray(value)
    ? value.map((entry) =>
        typeof entry === "boolean" ||
        typeof entry === "number" ||
        typeof entry === "string" ||
        entry === null
          ? entry
          : text(entry)
      )
    : []
}

function activeStatus(value: unknown) {
  return !["inactive", "terminated", "left"].includes(text(value).toLowerCase())
}

function requiredStatus(value: unknown) {
  return !["no", "false", "0", "optional"].includes(text(value).toLowerCase())
}

function checklistValue(item: Payload, key: string): EntryValue {
  const value = item[key]
  const inputType = text(item.inputType).toLowerCase()
  if (["checkbox", "boolean", "pass_fail", "yes_no"].includes(inputType)) {
    return ["true", "yes", "1", "ok", "pass", "passed"].includes(
      text(value).toLowerCase()
    )
  }
  const numeric = numberOrUndefined(value)
  if (["number", "numeric"].includes(inputType) && numeric !== undefined) {
    return numeric
  }
  return value === null || value === undefined ? null : text(value)
}

function itemKey(item: Payload) {
  return (
    text(item.itemKey) ||
    `${text(item.sequence)}|${text(item.checkPoint || item.prompt)}`
  )
}

function qualityParameterCode(payload: Payload) {
  return (
    text(payload.code || payload.parameterCode) ||
    [payload.parameterName || payload.description, payload.specification]
      .map(text)
      .filter(Boolean)
      .join("|") ||
    text(payload.uid)
  )
}

function parameterPlan(payload: Payload) {
  const nominalValue = numberOrUndefined(payload.specification)
  const plus = numberOrUndefined(payload.tolerancePlus)
  const minus = numberOrUndefined(payload.toleranceMinus)
  const inputType = text(payload.inputType || "number").toLowerCase()
  const dataType =
    inputType === "number"
      ? "numeric"
      : ["checkbox", "pass_fail", "boolean", "yes_no"].includes(inputType)
        ? "boolean"
        : "text"

  return {
    capability: "quality.parameters.manage",
    family: "quality",
    operation: "parameter",
    input: {
      active: activeStatus(payload.status),
      dataType,
      inputType,
      itemUid: text(payload.partNo || payload.partCode || payload.uid),
      lowerLimit:
        nominalValue !== undefined && minus !== undefined
          ? nominalValue - Math.abs(minus)
          : undefined,
      name: text(payload.parameterName || payload.description),
      nominalValue,
      operationSetupCode: text(payload.setupNo),
      parameterCode: qualityParameterCode(payload),
      payload,
      productionFloorCode: text(payload.productionFloorCode),
      routeCode: text(payload.optionNumber) || "1",
      sequence: numberOrUndefined(payload.sequence) ?? 0,
      unit: optionalText(payload.unit),
      upperLimit:
        nominalValue !== undefined && plus !== undefined
          ? nominalValue + Math.abs(plus)
          : undefined,
    },
  } as const
}

function setupTemplateCode(payload: Payload) {
  const checklistCode = text(payload.checklistCode)
  if (checklistCode) return checklistCode
  const legacyVersion = text(payload.masterVersion || payload.version)
  if (!legacyVersion) return ""
  return /^(SC\d+|SETUP-)/i.test(legacyVersion)
    ? legacyVersion
    : `SETUP-${legacyVersion}`
}

function setupSessionPlan(payload: Payload) {
  const items = records(payload.items)
  const common = {
    jobCardNumber: text(payload.jcNo || payload.jobCard),
    machineNumber: optionalText(payload.machine || payload.machineNo),
    operationSetupCode: text(payload.setupNo),
    payload,
    productionFloorCode: text(payload.productionFloorCode),
    sessionKey: text(payload.sessionId),
    status: text(payload.status) || "In progress",
    templateCode: setupTemplateCode(payload) || "SETUP-CURRENT",
  }
  const phases = [
    {
      input: {
        ...common,
        completedBy: optionalText(
          payload.startedBy || payload.completedBy
        ),
        completedAt: optionalText(payload.startedAt),
        phase: "start" as const,
        results: items
          .filter(
            (item) =>
              setupChecklistItemAppliesToPhase(item.section, "start") &&
              Object.hasOwn(item, "startValue")
          )
          .map((item) => ({
            itemKey: itemKey(item),
            itemPrompt: optionalText(item.checkPoint || item.prompt),
            notes: optionalText(item.startItemRemark),
            sequence: numberOrUndefined(item.sequence),
            value: checklistValue(item, "startValue"),
          })),
      },
    },
    {
      input: {
        ...common,
        completedBy: optionalText(
          payload.endedBy || payload.completedBy
        ),
        completedAt: optionalText(payload.endedAt || payload.completedAt),
        phase: "end" as const,
        results: items
          .filter(
            (item) =>
              setupChecklistItemAppliesToPhase(item.section, "end") &&
              Object.hasOwn(item, "endValue")
          )
          .map((item) => ({
            itemKey: itemKey(item),
            itemPrompt: optionalText(item.checkPoint || item.prompt),
            notes: optionalText(item.endItemRemark),
            sequence: numberOrUndefined(item.sequence),
            value: checklistValue(item, "endValue"),
          })),
      },
    },
  ].filter((phase) => phase.input.results.length > 0)

  return {
    capability: "quality.setup_checklist.write",
    family: "quality",
    operation: "setup-session",
    phases,
  } as const
}

function maintenanceTaskPlan(payload: Payload) {
  const common = {
    completedAt:
      text(payload.completedAt) ||
      `${text(payload.completedDate) || new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    completedBy: optionalText(payload.completedBy),
    machineNumber: text(payload.machineNo || payload.machine),
    payload,
    productionFloorCode: text(payload.productionFloorCode),
    taskKey: text(payload.taskId),
  }
  if (text(payload.maintenanceType).toLowerCase() === "breakdown") {
    return {
      capability: "maintenance.tasks.write",
      family: "maintenance",
      operation: "breakdown-task",
      input: common,
    } as const
  }
  return {
    capability: "maintenance.tasks.write",
    family: "maintenance",
    operation: "planned-task",
    input: {
      ...common,
      dueOn: text(payload.completedDate || payload.dueDate),
      nextDueOn: optionalText(payload.nextDueDate),
      results: records(payload.checklistSteps).map((step) => ({
        itemKey:
          text(step.itemKey) ||
          `${text(step.checklistCode || payload.checklistCode)}|${text(step.sequence)}`,
        itemPrompt: optionalText(step.stepDescription || step.prompt),
        notes: optionalText(step.remark),
        passed: ["ok", "pass", "passed", "completed"].includes(
          text(step.result).toLowerCase()
        ),
        sequence: numberOrUndefined(step.sequence),
        value:
          step.value === null ||
          typeof step.value === "boolean" ||
          typeof step.value === "number"
            ? step.value
            : text(step.value),
      })),
      scheduleKey:
        text(payload.scheduleKey) ||
        `${text(payload.machineNo)}|${text(payload.maintenanceCode)}`,
      taskType: text(payload.maintenanceType) || "Planned",
    },
  } as const
}

export function operationalEntryPlan(entryType: string, payload: Payload) {
  if (entryType === "rejection_type_master") {
    return {
      capability: "quality.parameters.manage",
      family: "quality",
      operation: "rejection-type",
      input: {
        active: activeStatus(payload.status),
        code: text(payload.code),
        name: text(payload.typeOfRejection || payload.name),
        payload,
      },
    } as const
  }
  if (entryType === "rejection_reason_master") {
    return {
      capability: "quality.parameters.manage",
      family: "quality",
      operation: "rejection-reason",
      input: {
        active: activeStatus(payload.status),
        code: text(payload.code),
        name: text(payload.rejectionReason || payload.name),
        payload,
      },
    } as const
  }
  if (entryType === "rejection_remark_master") {
    return {
      capability: "quality.parameters.manage",
      family: "quality",
      operation: "rejection-remark",
      input: {
        active: activeStatus(payload.status),
        code: text(payload.code),
        payload,
        remark: text(payload.rejectionRemark || payload.remark),
      },
    } as const
  }
  if (entryType === "employee") {
    return {
      capability: "hr.employees.write",
      family: "workforce",
      operation: "employee",
      input: {
        active: activeStatus(payload.status),
        department: optionalText(payload.department || payload.location),
        designation: optionalText(payload.employeeType || payload.designation),
        employeeCode: text(payload.empId || payload.employeeCode),
        joinedOn: optionalText(payload.doj || payload.joinedOn),
        leftOn: optionalText(payload.terminatedDate || payload.leftOn),
        name: text(payload.employeeName || payload.name),
        payload,
      },
    } as const
  }
  if (["attendance", "attendance_record"].includes(entryType)) {
    return {
      capability: "operations.attendance.write",
      family: "workforce",
      operation: "attendance",
      input: {
        attendanceDate: text(payload.attendanceDate || payload.date),
        clockIn: optionalText(payload.clockIn),
        clockOut: optionalText(payload.clockOut),
        employeeCode: text(
          payload.employeeCode || payload.empId || payload.operatorId
        ),
        legacyActor: optionalText(payload.recordedBy),
        payload,
        shift: optionalText(payload.shift),
        status: text(payload.status),
      },
    } as const
  }
  if (["training", "training_record"].includes(entryType)) {
    return {
      capability: "operations.training.write",
      family: "workforce",
      operation: "training",
      input: {
        durationMinutes: numberOrUndefined(payload.durationMinutes),
        employeeCode: text(payload.employeeCode || payload.empId),
        legacyTrainer: optionalText(payload.trainerName || payload.trainer),
        payload,
        result: optionalText(payload.result),
        topic: text(payload.topic),
        trainerEmployeeCode: optionalText(payload.trainerEmployeeCode),
        trainingDate: text(payload.trainingDate || payload.date),
      },
    } as const
  }
  if (
    ["quality_parameter_master", "first_piece_inspection_master"].includes(
      entryType
    )
  ) {
    return parameterPlan(payload)
  }
  if (entryType === "first_piece_inspection_report") {
    const dimensions = records(payload.dimensions)
    return {
      capability: "quality.first_piece.write",
      family: "quality",
      operation: "first-piece",
      input: {
        approvedBy: optionalText(payload.approvedBy),
        dimensions: dimensions.map((dimension) => ({
          parameterCode:
            text(dimension.parameterCode || dimension.code || dimension.uid) ||
            qualityParameterCode(dimension),
          parameterName: optionalText(
            dimension.parameterName || dimension.description || dimension.name
          ),
          readings: entryValues(dimension.readings),
        })),
        inspectedAt: text(
          payload.taskCompletedAt || payload.savedAt || payload.createdAt
        ),
        inspectionKey:
          text(payload.reportId) ||
          [
            payload.jcNo || payload.jobCard,
            payload.partCode || payload.partNo,
            payload.optionNumber,
            payload.setupNo,
            payload.machine || payload.machineNo,
            "fpi",
          ]
            .map(text)
            .join("|"),
        jobCardNumber: text(payload.jcNo || payload.jobCard),
        machineNumber: optionalText(payload.machine || payload.machineNo),
        notes: optionalText(payload.remark || payload.notes),
        operationSetupCode: text(payload.setupNo),
        payload,
        productionFloorCode: text(payload.productionFloorCode),
        status: text(payload.status) || "Approved",
      },
    } as const
  }
  if (entryType === "hourly_quality_check") {
    return {
      capability: "quality.hourly.write",
      family: "quality",
      operation: "hourly",
      input: {
        checkKey: text(payload.checkId),
        checkedAt: text(
          payload.savedAt || payload.checkedAt || payload.prodDate
        ),
        checkedBy: optionalText(payload.checkedBy),
        jobCardNumber: text(payload.jobCard || payload.jcNo),
        machineNumber: optionalText(payload.machine || payload.machineNo),
        operationSetupCode: text(payload.setupNo),
        payload,
        productionFloorCode: text(payload.productionFloorCode),
        readings: records(payload.readings).map((reading) => ({
          actualReading:
            reading.actualReading === null ||
            typeof reading.actualReading === "boolean" ||
            typeof reading.actualReading === "number"
              ? reading.actualReading
              : text(reading.actualReading),
          parameterCode: text(
            reading.parameterCode || reading.code || reading.uid
          ),
          parameterName: optionalText(
            reading.parameterName || reading.description || reading.name
          ),
          result: optionalText(reading.result),
        })),
        status:
          text(payload.status) ||
          ((numberOrUndefined(payload.ngCount) ?? 0) > 0 ? "Not OK" : "OK"),
      },
    } as const
  }
  if (entryType === "setup_checklist_master") {
    const prompt = text(payload.checkPoint || payload.prompt)
    const sequence = numberOrUndefined(payload.sequence) ?? 0
    return {
      capability: "quality.parameters.manage",
      family: "quality",
      operation: "setup-template",
      input: {
        active: activeStatus(payload.status),
        code: setupTemplateCode(payload),
        items: [
          {
            active: activeStatus(payload.status),
            inputType: text(payload.inputType) || "checkbox",
            itemKey: text(payload.itemKey) || `${sequence}|${prompt}`,
            prompt,
            required: requiredStatus(payload.required),
            sequence,
          },
        ],
        name: text(payload.checklistTitle || payload.title) || "Setup checklist",
        payload,
        revision: 1,
      },
    } as const
  }
  if (entryType === "setup_checklist_session") {
    return setupSessionPlan(payload)
  }
  if (entryType === "setup_checklist") {
    const legacyFields = [
      "modhiyu",
      "helperCode",
      "setterCode",
      "qcController",
      "settingStartTime",
      "settingEndTime",
      "rimmerAvailability",
    ]
    return {
      capability: "quality.setup_checklist.write",
      family: "quality",
      operation: "legacy-setup-session",
      input: {
        completedBy: optionalText(payload.setterCode),
        jobCardNumber: text(payload.jcNo),
        machineNumber: optionalText(payload.machineNo),
        operationSetupCode: text(payload.setupNo),
        payload,
        phase: "end" as const,
        productionFloorCode: text(payload.productionFloorCode),
        results: legacyFields
          .filter((key) => Object.hasOwn(payload, key))
          .map((key) => ({ itemKey: key, value: text(payload[key]) })),
        sessionKey: text(payload.sessionId || payload.jcNo),
        status: "Completed",
        templateCode: "SETUP-legacy",
      },
    } as const
  }
  if (entryType === "maintenance_master") {
    return {
      capability: "maintenance.definitions.manage",
      family: "maintenance",
      operation: "definition",
      input: {
        active: activeStatus(payload.status),
        checklistCode: optionalText(payload.checklistCode),
        code: text(payload.maintenanceCode),
        description: optionalText(payload.remark || payload.description),
        estimatedMinutes: numberOrUndefined(payload.estimatedMinutes),
        frequencyBasis: optionalText(payload.frequencyBasis),
        frequencyDays: numberOrUndefined(payload.frequencyDays) ?? 1,
        items: [],
        name: text(payload.maintenanceTitle),
        payload,
      },
    } as const
  }
  if (entryType === "maintenance_checklist_master") {
    const checklistCode = text(payload.checklistCode)
    const sequence = numberOrUndefined(payload.sequence) ?? 0
    return {
      capability: "maintenance.definitions.manage",
      family: "maintenance",
      operation: "checklist-item",
      input: {
        checklistCode,
        checklistTitle: text(payload.checklistTitle) || checklistCode,
        item: {
          active: activeStatus(payload.status),
          inputType: text(payload.inputType) || "checkbox",
          itemKey: text(payload.itemKey) || `${checklistCode}|${sequence}`,
          prompt: text(payload.stepDescription),
          required: requiredStatus(payload.required),
          sequence,
        },
        payload,
      },
    } as const
  }
  if (entryType === "maintenance_schedule") {
    return {
      capability: "maintenance.schedules.manage",
      family: "maintenance",
      operation: "schedule",
      input: {
        active: activeStatus(payload.status),
        definitionCode: text(payload.maintenanceCode),
        machineNumber: text(payload.machineNo),
        nextDueOn: text(payload.firstDueDate || payload.nextDueDate),
        payload,
        productionFloorCode: text(payload.productionFloorCode),
        scheduleKey:
          text(payload.scheduleKey) ||
          `${text(payload.machineNo)}|${text(payload.maintenanceCode)}`,
      },
    } as const
  }
  if (entryType === "maintenance_task") {
    return maintenanceTaskPlan(payload)
  }
  return null
}
