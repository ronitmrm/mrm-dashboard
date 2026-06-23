export type ProductionEntry = {
  prodDate: string;
  operatorId: string;
  operatorName?: string;
  machineType: string;
  machine: string;
  partCode: string;
  jobCard?: string;
  setupNo?: string;
  outputQty: number;
  actualQty?: number;
  targetQty: number;
  rejectQty: number;
  rejectionType?: string;
  rejectionRemark?: string;
  downtimeMinutes?: number;
  downtimeReason?: string;
};

export type AttendanceRecord = {
  operatorId: string;
  operatorName?: string;
  monthKey: string;
  workingDays: number;
  presentDays: number;
  score?: number;
};

export type TrainingRecord = {
  operatorId: string;
  operatorName?: string;
  department?: string;
  date?: string;
  trainingType: string;
  reason?: string;
  trainer?: string;
  status: string;
};

export type DashboardFilters = {
  operatorId?: string;
  machineType?: string;
  machine?: string;
  month?: string;
  startDate?: string;
  endDate?: string;
};

export type DashboardInput = {
  workbookName: string;
  productionEntries: ProductionEntry[];
  attendanceRecords?: AttendanceRecord[];
  trainingRecords?: TrainingRecord[];
  filters?: DashboardFilters;
  updatedAt?: string;
};

type Totals = {
  output: number;
  actual: number;
  target: number;
  reject: number;
  downtime: number;
  runs: number;
};

const monthFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function emptyTotals(): Totals {
  return {
    output: 0,
    actual: 0,
    target: 0,
    reject: 0,
    downtime: 0,
    runs: 0,
  };
}

function addEntry(totals: Totals, entry: ProductionEntry) {
  totals.output += safeNumber(entry.outputQty);
  totals.actual += safeNumber(entry.actualQty);
  totals.target += safeNumber(entry.targetQty);
  totals.reject += safeNumber(entry.rejectQty);
  totals.downtime += safeNumber(entry.downtimeMinutes);
  totals.runs += 1;
}

function safeNumber(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function ratio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

function monthKey(dateText: string) {
  return dateText.slice(0, 7);
}

function monthLabel(key: string) {
  const date = new Date(`${key}-01T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return key;
  }
  return monthFormatter.format(date);
}

function inRange(entry: ProductionEntry, filters: DashboardFilters) {
  if (filters.operatorId && entry.operatorId !== filters.operatorId) {
    return false;
  }
  if (filters.machineType && entry.machineType !== filters.machineType) {
    return false;
  }
  if (filters.machine && entry.machine !== filters.machine) {
    return false;
  }
  if (filters.month && monthKey(entry.prodDate) !== filters.month) {
    return false;
  }
  if (filters.startDate && entry.prodDate < filters.startDate) {
    return false;
  }
  if (filters.endDate && entry.prodDate > filters.endDate) {
    return false;
  }
  return true;
}

function sortedValues<T>(map: Map<string, T>) {
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
}

function isPendingTraining(record: TrainingRecord) {
  return !["complete", "completed", "done", "closed"].includes(record.status.trim().toLowerCase());
}

export function buildDashboardSnapshot(input: DashboardInput) {
  const filters = input.filters ?? {};
  const allEntries = input.productionEntries;
  const entries = allEntries.filter((entry) => inRange(entry, filters));

  const operators = new Map<string, Totals & { operatorId: string; name: string }>();
  const machines = new Map<string, Totals & { machineType: string; machine: string }>();
  const machineTypes = new Map<string, Totals & { machineType: string }>();
  const months = new Map<string, Totals & { monthKey: string; month: string }>();
  const days = new Map<string, Totals & { dateKey: string; date: string }>();
  const rejectHotspots = new Map<string, Totals & { partCode: string }>();
  const rejectionTypes = new Map<string, Totals & { rejectionType: string }>();
  const downtimeReasons = new Map<string, Totals & { reason: string }>();

  for (const entry of entries) {
    const operatorKey = entry.operatorId || "Unassigned";
    if (!operators.has(operatorKey)) {
      operators.set(operatorKey, { ...emptyTotals(), operatorId: operatorKey, name: entry.operatorName || operatorKey });
    }
    addEntry(operators.get(operatorKey)!, entry);

    const machineKey = `${entry.machineType}|${entry.machine}`;
    if (!machines.has(machineKey)) {
      machines.set(machineKey, { ...emptyTotals(), machineType: entry.machineType || "-", machine: entry.machine || "-" });
    }
    addEntry(machines.get(machineKey)!, entry);

    const machineTypeKey = entry.machineType || "-";
    if (!machineTypes.has(machineTypeKey)) {
      machineTypes.set(machineTypeKey, { ...emptyTotals(), machineType: machineTypeKey });
    }
    addEntry(machineTypes.get(machineTypeKey)!, entry);

    const entryMonthKey = monthKey(entry.prodDate);
    if (!months.has(entryMonthKey)) {
      months.set(entryMonthKey, { ...emptyTotals(), monthKey: entryMonthKey, month: monthLabel(entryMonthKey) });
    }
    addEntry(months.get(entryMonthKey)!, entry);

    if (!days.has(entry.prodDate)) {
      days.set(entry.prodDate, { ...emptyTotals(), dateKey: entry.prodDate, date: entry.prodDate });
    }
    addEntry(days.get(entry.prodDate)!, entry);

    if (entry.rejectQty > 0) {
      const partKey = entry.partCode || "-";
      if (!rejectHotspots.has(partKey)) {
        rejectHotspots.set(partKey, { ...emptyTotals(), partCode: partKey });
      }
      addEntry(rejectHotspots.get(partKey)!, entry);
    }

    if (entry.rejectionType && entry.rejectQty > 0) {
      if (!rejectionTypes.has(entry.rejectionType)) {
        rejectionTypes.set(entry.rejectionType, { ...emptyTotals(), rejectionType: entry.rejectionType });
      }
      addEntry(rejectionTypes.get(entry.rejectionType)!, entry);
    }

    if (entry.downtimeReason && safeNumber(entry.downtimeMinutes) > 0) {
      if (!downtimeReasons.has(entry.downtimeReason)) {
        downtimeReasons.set(entry.downtimeReason, { ...emptyTotals(), reason: entry.downtimeReason });
      }
      addEntry(downtimeReasons.get(entry.downtimeReason)!, entry);
    }
  }

  const operatorPerformance = sortedValues(operators)
    .map((row) => ({
      operatorId: row.operatorId,
      name: row.name,
      output: round(row.output),
      actual: round(row.actual),
      target: round(row.target),
      reject: round(row.reject),
      efficiency: ratio(row.output, row.target),
      rejectRate: ratio(row.reject, row.output),
      runs: row.runs,
    }))
    .sort((a, b) => b.output - a.output || a.name.localeCompare(b.name));

  const machineRows = sortedValues(machines)
    .map((row) => ({
      machineType: row.machineType,
      machine: row.machine,
      output: round(row.output),
      actual: round(row.actual),
      target: round(row.target),
      reject: round(row.reject),
      downtime: round(row.downtime),
      efficiency: ratio(row.output, row.target),
      rejectRate: ratio(row.reject, row.output),
      runs: row.runs,
    }))
    .sort((a, b) => a.machineType.localeCompare(b.machineType) || a.machine.localeCompare(b.machine));

  const machineTypeRows = sortedValues(machineTypes)
    .map((row) => ({
      machineType: row.machineType,
      output: round(row.output),
      target: round(row.target),
      reject: round(row.reject),
      downtime: round(row.downtime),
      efficiency: ratio(row.output, row.target),
      rejectRate: ratio(row.reject, row.output),
      runs: row.runs,
    }))
    .sort((a, b) => b.output - a.output || a.machineType.localeCompare(b.machineType));

  const monthSeries = sortedValues(months).map((row) => ({
    monthKey: row.monthKey,
    month: row.month,
    output: round(row.output),
    target: round(row.target),
    reject: round(row.reject),
    efficiency: ratio(row.output, row.target),
    runs: row.runs,
  }));

  const daySeries = sortedValues(days).map((row) => ({
    dateKey: row.dateKey,
    date: row.date,
    output: round(row.output),
    target: round(row.target),
    reject: round(row.reject),
    efficiency: ratio(row.output, row.target),
    rejectRate: ratio(row.reject, row.output),
    runs: row.runs,
  }));

  const pendingTraining = (input.trainingRecords ?? []).filter(isPendingTraining);
  const trainingByType = new Map<string, number>();
  for (const record of pendingTraining) {
    trainingByType.set(record.trainingType, (trainingByType.get(record.trainingType) ?? 0) + 1);
  }

  const attendanceRows = (input.attendanceRecords ?? [])
    .filter((record) => !filters.month || record.monthKey === filters.month)
    .map((record) => ({
      operatorId: record.operatorId,
      name: record.operatorName || record.operatorId,
      attendancePct: ratio(record.presentDays, record.workingDays),
      workingDays: record.workingDays,
      presentDays: record.presentDays,
      avgScore: safeNumber(record.score),
    }))
    .sort((a, b) => b.attendancePct - a.attendancePct);

  const attendanceMonths = [...new Set((input.attendanceRecords ?? []).map((record) => record.monthKey))]
    .filter((key) => !filters.month || key === filters.month)
    .sort();

  const totalOutput = operatorPerformance.reduce((sum, row) => sum + row.output, 0);
  const totalTarget = operatorPerformance.reduce((sum, row) => sum + row.target, 0);
  const totalReject = operatorPerformance.reduce((sum, row) => sum + row.reject, 0);

  const availableMonths = [...new Set(allEntries.map((entry) => monthKey(entry.prodDate)))]
    .sort()
    .map((key) => ({ key, label: monthLabel(key) }));

  return {
    updatedAt: input.updatedAt ?? "",
    workbook: input.workbookName,
    version: {
      workbook: input.workbookName,
      source: "convex",
    },
    filters: {
      selectedMachineType: filters.machineType ?? "",
      selectedMachine: filters.machine ?? "",
      selectedOperatorId: filters.operatorId ?? "",
      selectedMonth: filters.month ?? "",
      selectedStartDate: filters.startDate ?? "",
      selectedEndDate: filters.endDate ?? "",
      operators: operatorPerformance.map((row) => ({ operatorId: row.operatorId, name: row.name })),
      months: availableMonths,
      activeMonths: monthSeries.map((row) => ({ key: row.monthKey, label: row.month })),
      machines: [...new Set(allEntries.map((entry) => entry.machine).filter(Boolean))].sort(),
      activeMachines: [...new Set(entries.map((entry) => entry.machine).filter(Boolean))].sort(),
      machineTypes: [...new Set(allEntries.map((entry) => entry.machineType).filter(Boolean))].sort(),
    },
    summary: {
      totalOutput: round(totalOutput),
      totalTarget: round(totalTarget),
      avgEfficiency: ratio(totalOutput, totalTarget),
      rejectRate: ratio(totalReject, totalOutput),
      activeOperators: operatorPerformance.length,
      pendingTraining: pendingTraining.length,
      attendanceScope: attendanceMonths.map(monthLabel).join(", ") || "No attendance records for selected filter",
    },
    operatorPerformance,
    machineRows,
    machineTypeRows,
    rejectHotspots: sortedValues(rejectHotspots)
      .map((row) => ({
        partCode: row.partCode,
        output: round(row.output),
        target: round(row.target),
        reject: round(row.reject),
        rejectRate: ratio(row.reject, row.output),
        runs: row.runs,
      }))
      .sort((a, b) => b.reject - a.reject || a.partCode.localeCompare(b.partCode)),
    rejectionTypeAnalysis: sortedValues(rejectionTypes)
      .map((row) => ({
        rejectionType: row.rejectionType,
        output: round(row.output),
        reject: round(row.reject),
        rejectRate: ratio(row.reject, row.output),
        runs: row.runs,
      }))
      .sort((a, b) => b.reject - a.reject || a.rejectionType.localeCompare(b.rejectionType)),
    rejectionRemarkAnalysis: [],
    defectAnalysis: [],
    defectHotspots: [],
    downtimeByType: [],
    downtimeByMachine: [],
    downtimeReasons: sortedValues(downtimeReasons)
      .map((row) => ({
        reason: row.reason,
        downtime: round(row.downtime),
        runs: row.runs,
      }))
      .sort((a, b) => b.downtime - a.downtime || a.reason.localeCompare(b.reason)),
    attendance: attendanceRows,
    pendingTraining: pendingTraining.map((record) => ({
      operatorId: record.operatorId,
      name: record.operatorName || record.operatorId,
      department: record.department ?? "",
      date: record.date ?? "",
      trainingType: record.trainingType,
      reason: record.reason ?? "",
      trainer: record.trainer ?? "",
      status: record.status || "Pending",
    })),
    trainingByType: [...trainingByType.entries()]
      .map(([trainingType, count]) => ({ trainingType, count }))
      .sort((a, b) => b.count - a.count || a.trainingType.localeCompare(b.trainingType)),
    trainingGuidance: [],
    monthlyTrainingPlan: [],
    meetingTracker: {
      month: "",
      rows: [],
      summary: {},
    },
    routingStatus: {
      summary: {},
      rows: [],
    },
    toolFixtureNumbers: {
      summary: {},
      rows: [],
    },
    monthlyMachineUsage: [],
    monthSeries,
    daySeries,
    operatorDayRows: [],
    setterPerformance: [],
    monthlyBySetter: [],
    dailyBySetter: [],
    sameSetupComparison: [],
    productionControl: {
      workOrders: [],
      combinedRows: [],
      machinePlanRows: [],
      machinePlanDetailRows: [],
      machineConstraintRows: [],
      planOverrideRows: [],
      routeChangeRows: [],
      dispatchRows: [],
      jobCardSetupProgressRows: [],
      setupChecklistHistoryRows: [],
      setupChecklistMismatchRows: [],
      validationIssues: [],
      plannerActionLog: [],
      routeSelectionRequired: [],
      routeOptions: [],
      routingSummary: {},
      summary: {},
    },
    setupAnalytics: {
      summary: {},
      rows: [],
      setupRows: [],
      machineRows: [],
      monthsForFilter: {},
    },
    dataEntry: {
      templates: [],
      keySummary: [],
      entryTypes: [],
    },
  };
}
