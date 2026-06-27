export type DashboardRecord = Record<string, unknown>;

export type DashboardRankedRow = {
  label: string;
  detail: string;
  value: number;
  secondary: number;
  rate: number;
};

export type DashboardTrendPoint = {
  label: string;
  output: number;
  target: number;
  reject: number;
  efficiency: number;
};

export type DashboardMetric = {
  label: string;
  value: string;
  detail: string;
  tone: "default" | "good" | "warning";
};

export type DashboardScheduleSummary = {
  plannedStart: string;
  plannedEnd: string;
  actualStart: string;
  actualEnd: string;
};

export type DashboardViewModel = {
  workbook: string;
  updatedAt: string;
  metrics: DashboardMetric[];
  trend: DashboardTrendPoint[];
  machines: DashboardRankedRow[];
  operators: DashboardRankedRow[];
  parts: DashboardRankedRow[];
  rejections: DashboardRankedRow[];
  downtime: DashboardRankedRow[];
  training: DashboardRankedRow[];
  filters: {
    month: string;
    machineType: string;
  };
};

const numberFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 1,
});

export function toDashboardViewModel(payload: unknown): DashboardViewModel {
  const data = isRecord(payload) ? payload : {};
  const summary = isRecord(data.summary) ? data.summary : data;
  const trend = firstArray(data, [
    "monthSeries",
    "monthlyProduction",
    "productionTrend",
    "trend",
  ]).map((row, index) => ({
    label: text(row, ["month", "monthLabel", "label", "date"], `Period ${index + 1}`),
    output: num(row, ["output", "outputQty", "totalOutput", "actualQty"]),
    target: num(row, ["target", "targetQty", "totalTarget"]),
    reject: num(row, ["reject", "rejectQty", "totalReject"]),
    efficiency: num(row, ["efficiency", "avgEfficiency", "outputRate"]),
  }));

  const totalOutput =
    num(summary, ["totalOutput", "output", "outputQty"]) ||
    sum(trend.map((point) => point.output));
  const totalTarget =
    num(summary, ["totalTarget", "target", "targetQty"]) ||
    sum(trend.map((point) => point.target));
  const totalReject =
    num(summary, ["totalReject", "reject", "rejectQty"]) ||
    sum(trend.map((point) => point.reject));
  const efficiency =
    num(summary, ["avgEfficiency", "efficiency", "outputRate"]) ||
    safeRatio(totalOutput, totalTarget);
  const rejectRate =
    num(summary, ["rejectRate", "rejectionRate"]) || safeRatio(totalReject, totalOutput);
  const attendanceRows = firstArray(data, ["attendance", "attendanceRows"]);
  const attendancePct = weightedAttendance(attendanceRows);
  const machines = rankedRows(firstArray(data, ["machineSummary", "machines", "machinePerformance", "machineRows"]), {
    label: ["machine", "machineName", "name"],
    detail: ["machineType", "type", "partCode"],
    value: ["output", "outputQty", "totalOutput", "actualQty"],
    secondary: ["target", "targetQty", "totalTarget"],
    rate: ["efficiency", "avgEfficiency", "outputRate"],
  });
  const operators = rankedRows(firstArray(data, ["operatorSummary", "operators", "operatorPerformance"]), {
    label: ["operatorName", "operator", "name"],
    detail: ["operatorId", "department", "machine"],
    value: ["output", "outputQty", "totalOutput", "actualQty"],
    secondary: ["target", "targetQty", "totalTarget"],
    rate: ["efficiency", "avgEfficiency", "outputRate"],
  });

  return {
    workbook: str(data.workbook) || str(data.workbookName) || "MRMPL workbook",
    updatedAt: str(data.updatedAt) || "",
    metrics: [
      {
        label: "Total output",
        value: formatNumber(totalOutput),
        detail: `${formatNumber(totalTarget)} target`,
        tone: "default",
      },
      {
        label: "Target",
        value: formatNumber(totalTarget),
        detail: "Planned production quantity",
        tone: "default",
      },
      {
        label: "Efficiency",
        value: formatPercent(efficiency),
        detail: "Actual output vs target",
        tone: efficiency >= 0.9 ? "good" : efficiency >= 0.75 ? "default" : "warning",
      },
      {
        label: "Reject pcs / rate",
        value: `${formatNumber(totalReject)} | ${formatPercent(rejectRate)}`,
        detail: "Rejected quantity and rejection rate",
        tone: rejectRate > 0.05 ? "warning" : "good",
      },
      {
        label: "Active operators",
        value: formatNumber(num(summary, ["activeOperators"]) || operators.length),
        detail: `${formatNumber(num(summary, ["activeMachines"]) || machines.length)} machines tracked`,
        tone: "default",
      },
      {
        label: "Attendance",
        value: attendancePct ? formatPercent(attendancePct) : "No data",
        detail: str(summary.attendanceScope) || "Selected attendance scope",
        tone: attendancePct >= 0.9 ? "good" : attendancePct > 0 ? "warning" : "default",
      },
    ],
    trend,
    machines,
    operators,
    parts: rankedRows(firstArray(data, ["partSummary", "parts", "partPerformance"]), {
      label: ["partCode", "part", "name"],
      detail: ["jobCard", "setupNo", "machineType"],
      value: ["output", "outputQty", "totalOutput", "actualQty"],
      secondary: ["target", "targetQty", "totalTarget"],
      rate: ["rejectRate", "rejectionRate"],
    }),
    rejections: rankedRows(firstArray(data, ["rejectionByType", "rejections", "rejectionSummary", "rejectionTypeAnalysis", "rejectHotspots"]), {
      label: ["rejectionType", "type", "reason", "name", "code", "partNo", "partCode"],
      detail: ["rejectionRemark", "remark", "machine", "machineType", "setup"],
      value: ["reject", "rejectQty", "count", "totalReject"],
      secondary: ["output", "outputQty", "totalOutput"],
      rate: ["rejectRate", "rejectionRate"],
    }),
    downtime: rankedRows(firstArray(data, ["downtimeByMachine", "downtime", "downtimeSummary"]), {
      label: ["machine", "machineName", "reason"],
      detail: ["downtimeReason", "machineType", "reason"],
      value: ["downtimeMinutes", "minutes", "duration"],
      secondary: ["output", "outputQty", "totalOutput"],
      rate: ["efficiency", "avgEfficiency", "outputRate"],
    }),
    training: rankedRows(firstArray(data, ["trainingByType", "monthlyTrainingPlan", "trainingRecords"]), {
      label: ["trainingType", "type", "topic"],
      detail: ["trainer", "department", "status"],
      value: ["count", "planned", "total"],
      secondary: ["completed", "done"],
      rate: ["completionRate", "rate"],
    }),
    filters: {
      month: nestedText(data, ["filters", "selectedMonth"]) || "All months",
      machineType: nestedText(data, ["filters", "selectedMachineType"]) || "All machines",
    },
  };
}

export function formatNumber(value: number) {
  return numberFormatter.format(Math.round(value * 10) / 10);
}

export function formatPercent(value: number) {
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${numberFormatter.format(Math.round(percent * 10) / 10)}%`;
}

export function jobCardScheduleSummary(
  row: DashboardRecord,
  setupRows: DashboardRecord[],
): DashboardScheduleSummary {
  return {
    plannedStart: firstDateLabel(setupRows, "plannedProductionStartDate"),
    plannedEnd: lastDateLabel(setupRows, "plannedProductionEndDate") || displayText(row.deliveryDate),
    actualStart: firstDateLabel(setupRows, "actualProductionStartDate"),
    actualEnd: lastDateLabel(setupRows, "actualProductionEndDate") || "-",
  };
}

export function firstDateLabel(rows: DashboardRecord[], key: string) {
  return sortedDateLabels(rows, key)[0] ?? "-";
}

export function lastDateLabel(rows: DashboardRecord[], key: string) {
  const labels = sortedDateLabels(rows, key);
  return labels[labels.length - 1] ?? "";
}

export function sortedDateLabels(rows: DashboardRecord[], key: string) {
  return rows
    .map((row) => displayText(row[key]))
    .filter((value) => value !== "-")
    .sort((a, b) => dateSortValue(a) - dateSortValue(b) || a.localeCompare(b));
}

export function dateSortValue(value: unknown) {
  const parsedDate = parseSortableDate(value);
  return parsedDate ? parsedDate.getTime() : Number.MAX_SAFE_INTEGER;
}

export function parseSortableDate(value: unknown) {
  const raw = str(value);
  if (!raw || raw === "-") return undefined;
  const directDate = new Date(raw);
  if (!Number.isNaN(directDate.getTime())) return directDate;
  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return normalizedDate(Number(year), Number(month) - 1, Number(day));
  }
  const namedMatch = raw.match(/^(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{2,4})$/);
  if (namedMatch) {
    const day = namedMatch[1] ?? "";
    const monthName = namedMatch[2] ?? "";
    const year = namedMatch[3] ?? "";
    const monthIndex = monthNameToIndex(monthName);
    if (monthIndex !== undefined) return normalizedDate(Number(year), monthIndex, Number(day));
  }
  return undefined;
}

function rankedRows(
  rows: DashboardRecord[],
  keys: {
    label: string[];
    detail: string[];
    value: string[];
    secondary: string[];
    rate: string[];
  },
) {
  return rows
    .map((row, index) => ({
      label: text(row, keys.label, `Row ${index + 1}`),
      detail: text(row, keys.detail, "No detail"),
      value: num(row, keys.value),
      secondary: num(row, keys.secondary),
      rate: num(row, keys.rate),
    }))
    .filter((row) => row.label !== "Row 0")
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

function firstArray(data: DashboardRecord, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }
  return [];
}

function nestedText(data: DashboardRecord, path: string[]) {
  let current: unknown = data;
  for (const key of path) {
    if (!isRecord(current)) return "";
    current = current[key];
  }
  return str(current);
}

function text(row: DashboardRecord, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = str(row[key]);
    if (value) return value;
  }
  return fallback;
}

function num(row: DashboardRecord, keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function displayText(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

function normalizedDate(year: number, monthIndex: number, day: number) {
  const fullYear = year < 100 ? 2000 + year : year;
  const date = new Date(fullYear, monthIndex, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function monthNameToIndex(value: string) {
  const months: Record<string, number> = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };
  return months[value.trim().toLowerCase()];
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function weightedAttendance(rows: DashboardRecord[]) {
  const present = sum(rows.map((row) => num(row, ["presentDays", "present", "present_days"])));
  const working = sum(rows.map((row) => num(row, ["workingDays", "working", "working_days"])));
  if (working) return present / working;
  const rates = rows.map((row) => num(row, ["attendancePct", "attendance", "score"])).filter((value) => value > 0);
  return rates.length ? sum(rates) / rates.length : 0;
}

function safeRatio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

function isRecord(value: unknown): value is DashboardRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
