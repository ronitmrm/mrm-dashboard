import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query, type ActionCtx, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { buildLegacyDashboardSnapshot } from "../lib/legacy-dashboard-analysis";

async function requireDashboardUserId(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Authentication is required to access the dashboard.");
  }
  return userId;
}

async function requireDashboardAccess(ctx: QueryCtx | MutationCtx | ActionCtx) {
  await requireDashboardUserId(ctx);
}

async function getGlobalOwnerFields(ctx: QueryCtx | MutationCtx) {
  await requireDashboardAccess(ctx);
  return { ownerId: undefined };
}

const optionalString = v.optional(v.string());
const optionalNumber = v.optional(v.number());
const importConfirmation = "replace-workbook-import";
const plannerActionConfirmation = "replace-workbook-and-planner-actions";
const dashboardSnapshotFreshForMs = 5 * 60 * 1000;
const workbookTables = [
  "productionEntries",
  "attendanceRecords",
  "trainingRecords",
  "routeSelections",
  "plannerPriorities",
  "machineConstraints",
  "planOverrides",
  "routeChanges",
  "dispatchApprovals",
  "setupCompletions",
  "dataEntries",
  "corrections",
] as const;

type WorkbookTable = typeof workbookTables[number];
type RefreshSnapshotResult = { ok: true; skipped: boolean; updatedAt?: string };

const productionEntryValidator = {
  prodDate: v.string(),
  operatorId: v.string(),
  operatorName: optionalString,
  machineType: v.string(),
  machine: v.string(),
  partCode: v.string(),
  jobCard: optionalString,
  setupNo: optionalString,
  outputQty: v.number(),
  actualQty: optionalNumber,
  targetQty: v.number(),
  rejectQty: v.number(),
  rejectionType: optionalString,
  rejectionRemark: optionalString,
  downtimeMinutes: optionalNumber,
  downtimeReason: optionalString,
};

const attendanceRecordValidator = {
  operatorId: v.string(),
  operatorName: optionalString,
  monthKey: v.string(),
  workingDays: v.number(),
  presentDays: v.number(),
  score: optionalNumber,
};

const trainingRecordValidator = {
  operatorId: v.string(),
  operatorName: optionalString,
  department: optionalString,
  date: optionalString,
  trainingType: v.string(),
  reason: optionalString,
  trainer: optionalString,
  status: v.string(),
};

const routeSelectionValidator = { jcNo: v.string(), optionNumber: v.string(), createdAt: optionalString };
const plannerPriorityValidator = {
  target: v.string(),
  jcNo: optionalString,
  partCode: optionalString,
  priority: v.string(),
  approvalMode: optionalString,
  interruptedJcNo: optionalString,
  interruptedSetupNo: optionalString,
  interruptedMachine: optionalString,
  interruptedFinishedQty: optionalNumber,
  interruptedSetups: v.optional(v.array(v.object({
    jcNo: v.string(),
    setupNo: v.string(),
    machine: v.string(),
    finishedQty: optionalNumber,
  }))),
  remark: optionalString,
  createdAt: optionalString,
};
const machineConstraintValidator = {
  machineNo: v.string(),
  unavailableFrom: v.string(),
  unavailableTo: v.string(),
  reason: v.string(),
  remark: optionalString,
  rescheduleAction: optionalString,
  createdAt: optionalString,
};
const planOverrideValidator = {
  target: v.string(),
  toMachine: v.string(),
  setupNo: optionalString,
  fromMachine: optionalString,
  reason: optionalString,
  createdAt: optionalString,
};
const routeChangeValidator = {
  target: v.string(),
  newOption: v.string(),
  changeAfterSetup: optionalString,
  applyFromSetup: optionalString,
  wipQty: optionalNumber,
  remainingSetups: v.optional(v.array(v.object({
    setupNo: v.string(),
    plan: v.boolean(),
    quantity: v.number(),
    remark: optionalString,
  }))),
  reason: optionalString,
  createdAt: optionalString,
};
const dispatchApprovalValidator = {
  jcNo: v.string(),
  approvedBy: v.string(),
  remark: optionalString,
  createdAt: optionalString,
};
const setupCompletionValidator = {
  jcNo: v.string(),
  completedBy: v.string(),
  remark: optionalString,
  setupNo: optionalString,
  machine: optionalString,
  createdAt: optionalString,
};
const dataEntryValidator = {
  entryType: v.string(),
  key: optionalString,
  payload: v.any(),
  createdAt: optionalString,
};

function now() {
  return new Date().toISOString();
}

export const snapshot = query({
  args: {
    operatorId: optionalString,
    machineType: optionalString,
    machine: optionalString,
    month: optionalString,
    startDate: optionalString,
    endDate: optionalString,
  },
  handler: async (ctx, args) => {
    await requireDashboardAccess(ctx);
    const cached = await readDashboardSnapshotPayload(ctx, null);
    if (cached) {
      return applySnapshotFilters(cached, args);
    }
    return applySnapshotFilters(emptyDashboardSnapshot(), args);
  },
});

export const refreshSnapshot = action({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<RefreshSnapshotResult> => {
    await requireDashboardAccess(ctx);
    if (!args.force) {
      const freshness: { fresh: boolean; updatedAt?: string } = await ctx.runQuery(internal.dashboard.dashboardSnapshotFreshness, {
        maxAgeMs: dashboardSnapshotFreshForMs,
        nowMs: Date.now(),
      });
      if (freshness.fresh) {
        return { ok: true, skipped: true, updatedAt: freshness.updatedAt };
      }
    }
    const source = emptySnapshotSource();
    for (const table of snapshotSourceTables) {
      for (const ownerScope of snapshotSourceOwnerScopes) {
        let cursor: string | null = null;
        do {
          const result: { page: SnapshotSourceRow[]; isDone: boolean; continueCursor: string } = await ctx.runQuery(internal.dashboard.collectSnapshotTablePage, {
            table,
            ownerScope,
            paginationOpts: { numItems: 1000, cursor },
          });
          appendSnapshotRows(source, table, result.page);
          cursor = result.isDone ? null : result.continueCursor;
        } while (cursor !== null);
      }
    }
    const payload = buildDashboardSnapshotPayload(source);
    const saveResult: { ok: true; changed: boolean; updatedAt?: string } = await ctx.runMutation(internal.dashboard.saveDashboardSnapshot, { payload, cacheUpdatedAt: now() });
    return { ok: true, skipped: !saveResult.changed, updatedAt: saveResult.updatedAt ?? payload.updatedAt };
  },
});

export const dashboardSnapshotFreshness = internalQuery({
  args: {
    maxAgeMs: v.number(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const chunks = await latestDashboardSnapshotChunks(ctx, null);
    if (!chunks.length) return { exists: false, fresh: false };
    const updatedAt = latestSnapshotChunkUpdatedAt(chunks);
    const updatedAtMs = Date.parse(updatedAt);
    return {
      exists: true,
      fresh: Number.isFinite(updatedAtMs) && args.nowMs - updatedAtMs <= args.maxAgeMs,
      updatedAt,
    };
  },
});

function latestSnapshotChunkUpdatedAt(chunks: Array<{ updatedAt?: string; _creationTime?: number }>) {
  return chunks.reduce((latest, row) => {
    const updatedAt =
      typeof row.updatedAt === "string" && row.updatedAt
        ? row.updatedAt
        : typeof row._creationTime === "number"
          ? new Date(row._creationTime).toISOString()
          : "";
    return updatedAt > latest ? updatedAt : latest;
  }, "");
}

export const collectSnapshotTablePage = internalQuery({
  args: {
    table: v.union(
      v.literal("productionEntries"),
      v.literal("attendanceRecords"),
      v.literal("trainingRecords"),
      v.literal("routeSelections"),
      v.literal("plannerPriorities"),
      v.literal("machineConstraints"),
      v.literal("planOverrides"),
      v.literal("routeChanges"),
      v.literal("dispatchApprovals"),
      v.literal("setupCompletions"),
      v.literal("corrections"),
      v.literal("dataEntries"),
    ),
    ownerScope: v.union(v.literal("owner"), v.literal("global")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return paginateSnapshotTable(
      ctx,
      args.table,
      args.paginationOpts,
    );
  },
});

export const saveDashboardSnapshot = internalMutation({
  args: {
    payload: v.any(),
    cacheUpdatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const updatedAt = typeof args.payload?.updatedAt === "string" && args.payload.updatedAt ? args.payload.updatedAt : now();
    const result = await replaceDashboardSnapshotChunks(ctx, null, args.payload, args.cacheUpdatedAt);
    return { ok: true as const, changed: result.changed, updatedAt: result.updatedAt || updatedAt };
  },
});

function activeCorrectionTargets(corrections: Array<{ targetTable: string; targetId: string; action: string }>) {
  return new Set(corrections
    .filter((row) => row.action === "reverse" || row.action === "replace" || row.action === "close")
    .map((row) => `${row.targetTable}:${row.targetId}`));
}

function withoutCorrectedRows<Row extends { _id: unknown }>(
  rows: Row[],
  targetTable: string,
  correctionTargets: Set<string>,
) {
  return rows.filter((row) => !correctionTargets.has(`${targetTable}:${String(row._id)}`));
}

const snapshotSourceTables = [
  "productionEntries",
  "attendanceRecords",
  "trainingRecords",
  "routeSelections",
  "plannerPriorities",
  "machineConstraints",
  "planOverrides",
  "routeChanges",
  "dispatchApprovals",
  "setupCompletions",
  "corrections",
  "dataEntries",
] as const;
const snapshotSourceOwnerScopes = ["global"] as const;

type SnapshotSourceTable = typeof snapshotSourceTables[number];
type SnapshotSourceRow = Record<string, unknown> & { _id: unknown; createdAt?: string; _creationTime?: number };
type SnapshotSource = ReturnType<typeof emptySnapshotSource>;
type PaginationOpts = {
  numItems: number;
  cursor: string | null;
  endCursor?: string | null;
  id?: number;
  maximumRowsRead?: number;
  maximumBytesRead?: number;
};

function emptySnapshotSource() {
  return {
    productionEntries: [] as SnapshotSourceRow[],
    attendanceRecords: [] as SnapshotSourceRow[],
    trainingRecords: [] as SnapshotSourceRow[],
    routeSelections: [] as SnapshotSourceRow[],
    plannerPriorities: [] as SnapshotSourceRow[],
    machineConstraints: [] as SnapshotSourceRow[],
    planOverrides: [] as SnapshotSourceRow[],
    routeChanges: [] as SnapshotSourceRow[],
    dispatchApprovals: [] as SnapshotSourceRow[],
    setupCompletions: [] as SnapshotSourceRow[],
    corrections: [] as Array<SnapshotSourceRow & { targetTable: string; targetId: string; action: string }>,
    allDataEntries: [] as Array<SnapshotSourceRow & { entryType: string }>,
  };
}

function paginateSnapshotTable(
  ctx: QueryCtx,
  table: SnapshotSourceTable,
  paginationOpts: PaginationOpts,
) {
  switch (table) {
    case "productionEntries":
      return ctx.db
        .query("productionEntries")
        .paginate(paginationOpts);
    case "attendanceRecords":
      return ctx.db
        .query("attendanceRecords")
        .paginate(paginationOpts);
    case "trainingRecords":
      return ctx.db
        .query("trainingRecords")
        .paginate(paginationOpts);
    case "routeSelections":
      return ctx.db
        .query("routeSelections")
        .paginate(paginationOpts);
    case "plannerPriorities":
      return ctx.db
        .query("plannerPriorities")
        .paginate(paginationOpts);
    case "machineConstraints":
      return ctx.db
        .query("machineConstraints")
        .paginate(paginationOpts);
    case "planOverrides":
      return ctx.db
        .query("planOverrides")
        .paginate(paginationOpts);
    case "routeChanges":
      return ctx.db
        .query("routeChanges")
        .paginate(paginationOpts);
    case "dispatchApprovals":
      return ctx.db
        .query("dispatchApprovals")
        .paginate(paginationOpts);
    case "setupCompletions":
      return ctx.db
        .query("setupCompletions")
        .paginate(paginationOpts);
    case "corrections":
      return ctx.db
        .query("corrections")
        .paginate(paginationOpts);
    case "dataEntries":
      return ctx.db
        .query("dataEntries")
        .paginate(paginationOpts);
  }
}

function appendSnapshotRows(source: SnapshotSource, table: SnapshotSourceTable, rows: SnapshotSourceRow[]) {
  switch (table) {
    case "productionEntries":
      source.productionEntries.push(...rows);
      return;
    case "attendanceRecords":
      source.attendanceRecords.push(...rows);
      return;
    case "trainingRecords":
      source.trainingRecords.push(...rows);
      return;
    case "routeSelections":
      source.routeSelections.push(...rows);
      return;
    case "plannerPriorities":
      source.plannerPriorities.push(...rows);
      return;
    case "machineConstraints":
      source.machineConstraints.push(...rows);
      return;
    case "planOverrides":
      source.planOverrides.push(...rows);
      return;
    case "routeChanges":
      source.routeChanges.push(...rows);
      return;
    case "dispatchApprovals":
      source.dispatchApprovals.push(...rows);
      return;
    case "setupCompletions":
      source.setupCompletions.push(...rows);
      return;
    case "corrections":
      source.corrections.push(...rows as Array<SnapshotSourceRow & { targetTable: string; targetId: string; action: string }>);
      return;
    case "dataEntries":
      source.allDataEntries.push(...rows as Array<SnapshotSourceRow & { entryType: string }>);
      return;
  }
}

async function readDashboardSnapshotPayload(ctx: QueryCtx | MutationCtx, ownerId: Id<"users"> | null) {
  const chunks = await latestDashboardSnapshotChunks(ctx, ownerId);
  if (!chunks.length) return null;
  return JSON.parse(chunks.sort((a, b) => a.sequence - b.sequence).map((row) => row.chunk).join(""));
}

async function latestDashboardSnapshotChunks(ctx: QueryCtx | MutationCtx, ownerId: Id<"users"> | null) {
  if (ownerId) {
    const ownerRows = await exactDashboardSnapshotChunks(ctx, ownerId);
    if (ownerRows.length) return ownerRows;
  }
  return exactDashboardSnapshotChunks(ctx, null);
}

async function exactDashboardSnapshotChunks(ctx: QueryCtx | MutationCtx, ownerId: Id<"users"> | null) {
  return ctx.db
    .query("dashboardSnapshotChunks")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId ?? undefined))
    .collect();
}

async function replaceDashboardSnapshotChunks(ctx: MutationCtx, ownerId: Id<"users"> | null, payload: unknown, updatedAt: string) {
  const serialized = JSON.stringify(payload);
  const exactExisting = await exactDashboardSnapshotChunks(ctx, ownerId);
  const comparisonRows = exactExisting.length ? exactExisting : await latestDashboardSnapshotChunks(ctx, ownerId);
  if (serializedSnapshotChunks(comparisonRows) === serialized) {
    return {
      changed: false,
      updatedAt: latestSnapshotChunkUpdatedAt(comparisonRows),
    };
  }
  for (const row of exactExisting) {
    await ctx.db.delete(row._id);
  }
  const chunkSize = 650_000;
  for (let index = 0; index < serialized.length; index += chunkSize) {
    await ctx.db.insert("dashboardSnapshotChunks", {
      ownerId: ownerId ?? undefined,
      sequence: index / chunkSize,
      chunk: serialized.slice(index, index + chunkSize),
      updatedAt,
    });
  }
  return { changed: true, updatedAt };
}

function serializedSnapshotChunks(chunks: Array<{ sequence: number; chunk: string }>) {
  return chunks
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((row) => row.chunk)
    .join("");
}

function buildDashboardSnapshotPayload(source: SnapshotSource) {
  const correctionTargets = activeCorrectionTargets(source.corrections);
  const snapshotEntryTypeSet = new Set([...snapshotEntryTypes, "_summary"]);
  const dataEntries = withoutCorrectedRows(
    source.allDataEntries.filter((row) => snapshotEntryTypeSet.has(row.entryType)),
    "dataEntries",
    correctionTargets,
  );

  const snapshot = buildLegacyDashboardSnapshot({
    workbookName: "Convex",
    productionEntries: withoutCorrectedRows(source.productionEntries, "productionEntries", correctionTargets) as never,
    attendanceRecords: withoutCorrectedRows(source.attendanceRecords, "attendanceRecords", correctionTargets) as never,
    trainingRecords: withoutCorrectedRows(source.trainingRecords, "trainingRecords", correctionTargets) as never,
    dataEntries: dataEntries as never,
    routeSelections: withoutCorrectedRows(source.routeSelections, "routeSelections", correctionTargets),
    plannerPriorities: withoutCorrectedRows(source.plannerPriorities, "plannerPriorities", correctionTargets),
    machineConstraints: withoutCorrectedRows(source.machineConstraints, "machineConstraints", correctionTargets),
    planOverrides: withoutCorrectedRows(source.planOverrides, "planOverrides", correctionTargets),
    routeChanges: withoutCorrectedRows(source.routeChanges, "routeChanges", correctionTargets),
    dispatchApprovals: withoutCorrectedRows(source.dispatchApprovals, "dispatchApprovals", correctionTargets),
    setupCompletions: withoutCorrectedRows(source.setupCompletions, "setupCompletions", correctionTargets),
    updatedAt: latestCreatedAt(
      source.productionEntries,
      source.attendanceRecords,
      source.trainingRecords,
      source.routeSelections,
      source.plannerPriorities,
      source.machineConstraints,
      source.planOverrides,
      source.routeChanges,
      source.dispatchApprovals,
      source.setupCompletions,
      dataEntries,
      source.corrections,
    ),
    filters: {},
  });
  const liveCounts = countRowsByEntryType(dataEntries);

  return {
    ...snapshot,
    cacheStatus: "ready",
    dataEntry: {
      ...snapshot.dataEntry,
      templates: legacyEntryTypes.map((entryType) => ({ entryType, format: "xlsx" })),
      keySummary: legacyEntryTypes.map((entryType) => ({
        entryType,
        rows: liveCounts[entryType] ?? 0,
      })),
      entryTypes: legacyEntryTypes,
      corrections: source.corrections,
    },
  };
}

function emptyDashboardSnapshot() {
  return {
    ...buildDashboardSnapshotPayload({
      productionEntries: [],
      attendanceRecords: [],
      trainingRecords: [],
      routeSelections: [],
      plannerPriorities: [],
      machineConstraints: [],
      planOverrides: [],
      routeChanges: [],
      dispatchApprovals: [],
      setupCompletions: [],
      corrections: [],
      allDataEntries: [],
    }),
    cacheStatus: "missing",
  };
}

function applySnapshotFilters(payload: unknown, filters: Record<string, string | undefined>) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return payload;
  return {
    ...payload,
    filters,
  };
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireDashboardUserId(ctx);
    const latestRows = await Promise.all(workbookTables.map((table) => latestTableRow(ctx, table)));
    const updatedAt = latestCreatedAt(latestRows.flatMap((row) => (row ? [row] : [])));

    return {
      updatedAt,
      workbookVersion: updatedAt,
      appVersion: "design-system-dashboard",
      source: "convex",
    };
  },
});

function latestCreatedAt(
  ...groups: Array<Array<{ createdAt?: string; _creationTime?: number }>>
) {
  return groups.flat().reduce((latest, row) => {
    const createdAt =
      typeof row.createdAt === "string" && row.createdAt
        ? row.createdAt
        : typeof row._creationTime === "number"
          ? new Date(row._creationTime).toISOString()
          : "";
    return createdAt > latest ? createdAt : latest;
  }, "");
}

const legacyEntryTypes = [
  "machine_master",
  "dispatch",
  "rejection_classification",
  "raw_material_plan",
  "machine_planning",
  "quality_inspection",
  "route",
  "cycle",
  "tooling",
  "work_order",
  "rm_inward",
  "employee",
  "planning_holiday",
  "first_piece_inspection_master",
  "first_piece_inspection_report",
];

const snapshotEntryTypes = [...legacyEntryTypes, "shop_floor_status"];
const correctionCandidateTables = [
  "routeSelections",
  "plannerPriorities",
  "machineConstraints",
  "planOverrides",
  "routeChanges",
  "dispatchApprovals",
  "setupCompletions",
  "dataEntries",
] as const;

type CorrectionCandidateTable = typeof correctionCandidateTables[number];

function payloadRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function countRowsByEntryType(rows: Array<{ entryType: string }>) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.entryType] = (counts[row.entryType] ?? 0) + 1;
  }
  return counts;
}

function correctionCandidate(table: CorrectionCandidateTable, row: Record<string, unknown>) {
  const payload = payloadRecord(row.payload);
  const entryType = typeof row.entryType === "string" ? row.entryType : table;
  const targetKey = typeof row.key === "string" && row.key ? row.key : correctionKeyFor(table, row, payload);
  return {
    targetTable: table,
    targetId: String(row._id),
    targetKey,
    targetLabel: correctionLabelFor(table, row, payload),
    entryType,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    details: correctionDetailsFor(table, row, payload),
  };
}

function correctionKeyFor(table: string, row: Record<string, unknown>, payload: Record<string, unknown>) {
  if (table === "dataEntries") return [payload.jcNo, payload.partCode || payload.partNo, payload.optionNumber, payload.setupNo, payload.machine || payload.machineNo].map(cleanText).filter(Boolean).join(" | ");
  return [row.jcNo, row.target, row.machineNo, row.toMachine, row.newOption].map(cleanText).filter(Boolean).join(" | ");
}

function correctionLabelFor(table: string, row: Record<string, unknown>, payload: Record<string, unknown>) {
  if (table === "dataEntries") {
    const entryType = cleanText(row.entryType);
    if (entryType === "shop_floor_status") {
      return `${cleanText(payload.stageLabel) || cleanText(payload.stage) || "Workflow task"} - ${cleanText(payload.machine)} - ${cleanText(payload.partCode)} - setup ${cleanText(payload.setupNo)}`;
    }
    return `${entryType || "Data entry"} - ${correctionKeyFor(table, row, payload) || cleanText(row.key)}`;
  }
  return `${table} - ${correctionKeyFor(table, row, payload) || cleanText(row._id)}`;
}

function correctionDetailsFor(table: string, row: Record<string, unknown>, payload: Record<string, unknown>) {
  if (table === "dataEntries") return payload;
  return row;
}

async function globalCorrectionRows(ctx: QueryCtx) {
  return ctx.db
    .query("corrections")
    .collect();
}

async function globalCorrectionCandidateRows(
  ctx: QueryCtx,
  table: CorrectionCandidateTable,
  limit: number,
) {
  switch (table) {
    case "routeSelections": {
      return ctx.db
        .query("routeSelections")
        .order("desc")
        .take(limit);
    }
    case "plannerPriorities": {
      return ctx.db
        .query("plannerPriorities")
        .order("desc")
        .take(limit);
    }
    case "machineConstraints": {
      return ctx.db
        .query("machineConstraints")
        .order("desc")
        .take(limit);
    }
    case "planOverrides": {
      return ctx.db
        .query("planOverrides")
        .order("desc")
        .take(limit);
    }
    case "routeChanges": {
      return ctx.db
        .query("routeChanges")
        .order("desc")
        .take(limit);
    }
    case "dispatchApprovals": {
      return ctx.db
        .query("dispatchApprovals")
        .order("desc")
        .take(limit);
    }
    case "setupCompletions": {
      return ctx.db
        .query("setupCompletions")
        .order("desc")
        .take(limit);
    }
    case "dataEntries": {
      return ctx.db
        .query("dataEntries")
        .order("desc")
        .take(limit);
    }
  }
}

function cleanText(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

async function latestTableRow<TableName extends WorkbookTable>(
  ctx: QueryCtx,
  table: TableName,
) {
  const rows = await ctx.db.query(table).order("desc").take(1);
  return rows[0];
}

export const saveProductionEntry = mutation({
  args: productionEntryValidator,
  handler: async (ctx, args) => {
    const ownerFields = await getGlobalOwnerFields(ctx);
    const id = await ctx.db.insert("productionEntries", {
      ...args,
      ...ownerFields,
      createdAt: now(),
    });
    return { ok: true, id };
  },
});

export const saveAttendanceRecord = mutation({
  args: attendanceRecordValidator,
  handler: async (ctx, args) => {
    const ownerFields = await getGlobalOwnerFields(ctx);
    const id = await ctx.db.insert("attendanceRecords", {
      ...args,
      ...ownerFields,
      createdAt: now(),
    });
    return { ok: true, id };
  },
});

export const saveTrainingRecord = mutation({
  args: trainingRecordValidator,
  handler: async (ctx, args) => {
    const ownerFields = await getGlobalOwnerFields(ctx);
    const id = await ctx.db.insert("trainingRecords", {
      ...args,
      ...ownerFields,
      createdAt: now(),
    });
    return { ok: true, id };
  },
});

export const saveRouteSelection = mutation({
  args: { jcNo: v.string(), optionNumber: v.string() },
  handler: async (ctx, args) => insertOwnerRow(ctx, "routeSelections", args),
});

export const savePlannerPriority = mutation({
  args: {
    target: v.string(),
    jcNo: optionalString,
    partCode: optionalString,
    priority: v.string(),
    approvalMode: optionalString,
    interruptedJcNo: optionalString,
    interruptedSetupNo: optionalString,
    interruptedMachine: optionalString,
    interruptedFinishedQty: optionalNumber,
    interruptedSetups: v.optional(v.array(v.object({
      jcNo: v.string(),
      setupNo: v.string(),
      machine: v.string(),
      finishedQty: optionalNumber,
    }))),
    remark: optionalString,
  },
  handler: async (ctx, args) => insertOwnerRow(ctx, "plannerPriorities", args),
});

export const saveMachineConstraint = mutation({
  args: {
    machineNo: v.string(),
    unavailableFrom: v.string(),
    unavailableTo: v.string(),
    reason: v.string(),
    remark: optionalString,
    rescheduleAction: optionalString,
  },
  handler: async (ctx, args) => insertOwnerRow(ctx, "machineConstraints", args),
});

export const savePlanOverride = mutation({
  args: {
    target: v.string(),
    toMachine: v.string(),
    setupNo: optionalString,
    fromMachine: optionalString,
    reason: optionalString,
  },
  handler: async (ctx, args) => insertOwnerRow(ctx, "planOverrides", args),
});

export const saveRouteChange = mutation({
  args: {
    target: v.string(),
    newOption: v.string(),
    changeAfterSetup: optionalString,
    applyFromSetup: optionalString,
    wipQty: optionalNumber,
    remainingSetups: v.optional(v.array(v.object({
      setupNo: v.string(),
      plan: v.boolean(),
      quantity: v.number(),
      remark: optionalString,
    }))),
    reason: optionalString,
  },
  handler: async (ctx, args) => insertOwnerRow(ctx, "routeChanges", args),
});

export const saveDispatchApproval = mutation({
  args: { jcNo: v.string(), approvedBy: v.string(), remark: optionalString },
  handler: async (ctx, args) => insertOwnerRow(ctx, "dispatchApprovals", args),
});

export const markComplete = mutation({
  args: {
    jcNo: v.string(),
    completedBy: v.string(),
    remark: optionalString,
    setupNo: optionalString,
    machine: optionalString,
  },
  handler: async (ctx, args) => insertOwnerRow(ctx, "setupCompletions", args),
});

export const saveDataEntry = mutation({
  args: {
    id: v.optional(v.id("dataEntries")),
    entryType: v.string(),
    key: optionalString,
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const ownerFields = await getGlobalOwnerFields(ctx);
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) {
        throw new Error("Setup checklist entry was not found or cannot be edited.");
      }
      await ctx.db.patch(args.id, {
        entryType: args.entryType,
        key: args.key,
        payload: args.payload,
        ...ownerFields,
        createdAt: now(),
      });
      return { ok: true, id: args.id };
    }
    if (args.key) {
      const existingRows = await ctx.db
        .query("dataEntries")
        .withIndex("by_entry_type_key", (q) => q.eq("entryType", args.entryType).eq("key", args.key))
        .collect();
      const corrections = await ctx.db
        .query("corrections")
        .collect();
      const correctionTargets = activeCorrectionTargets(corrections);
      const existing = existingRows
        .filter((row) => !correctionTargets.has(`dataEntries:${String(row._id)}`))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1);
      if (existing) {
        await ctx.db.patch(existing._id, {
          entryType: args.entryType,
          key: args.key,
          payload: args.payload,
          ...ownerFields,
          createdAt: now(),
        });
        return { ok: true, id: existing._id };
      }
    }
    const result = await insertOwnerRow(ctx, "dataEntries", args);
    return result;
  },
});

export const reverseEntry = mutation({
  args: {
    targetTable: v.string(),
    targetId: v.string(),
    targetKey: optionalString,
    targetLabel: optionalString,
    reason: v.string(),
    correctedBy: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.reason.trim()) throw new Error("Correction reason is required.");
    if (!args.correctedBy.trim()) throw new Error("Corrected by is required.");
    const ownerFields = await getGlobalOwnerFields(ctx);
    const id = await ctx.db.insert("corrections", {
      ...args,
      action: "reverse",
      ...ownerFields,
      createdAt: now(),
    });
    return { ok: true, id };
  },
});

export const correctionCandidates = query({
  args: {
    targetTable: optionalString,
    limit: optionalNumber,
  },
  handler: async (ctx, args) => {
    await requireDashboardAccess(ctx);
    const corrections = await globalCorrectionRows(ctx);
    const correctionTargets = activeCorrectionTargets(corrections);
    const tableNames = correctionCandidateTables.filter((table) => !args.targetTable || table === args.targetTable);
    const results = [];
    for (const table of tableNames) {
      const rows = await globalCorrectionCandidateRows(ctx, table, args.limit ?? 100);
      for (const row of rows) {
        if (correctionTargets.has(`${table}:${String(row._id)}`)) continue;
        results.push(correctionCandidate(table, row));
      }
    }
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, args.limit ?? 200);
  },
});

export const seedSampleData = mutation({
  args: {},
  handler: async (ctx) => {
    await requireDashboardUserId(ctx);
    return {
      ok: false,
      inserted: 0,
      disabled: true,
      message: "Sample data seeding is disabled. Use scripts/import-workbook.mjs to import the real workbook.",
    };
  },
});

export const clearWorkbookData = mutation({
  args: {
    confirm: v.string(),
    batchSize: optionalNumber,
    includePlannerActions: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireDashboardUserId(ctx);
    if (args.confirm !== importConfirmation && args.confirm !== plannerActionConfirmation) {
      throw new Error(`Pass confirm: "${importConfirmation}" to clear imported workbook data.`);
    }
    if (args.includePlannerActions && args.confirm !== plannerActionConfirmation) {
      throw new Error(`Pass confirm: "${plannerActionConfirmation}" to clear imported workbook data plus planner actions.`);
    }
    const limit = Math.min(Math.max(Math.floor(args.batchSize ?? 100), 1), 500);
    const deleted: Record<string, number> = {
      productionEntries: await deleteBatch(ctx, "productionEntries", limit),
      attendanceRecords: await deleteBatch(ctx, "attendanceRecords", limit),
      trainingRecords: await deleteBatch(ctx, "trainingRecords", limit),
      dataEntries: await deleteBatch(ctx, "dataEntries", limit),
    };
    if (args.includePlannerActions) {
      deleted.routeSelections = await deleteBatch(ctx, "routeSelections", limit);
      deleted.plannerPriorities = await deleteBatch(ctx, "plannerPriorities", limit);
      deleted.machineConstraints = await deleteBatch(ctx, "machineConstraints", limit);
      deleted.planOverrides = await deleteBatch(ctx, "planOverrides", limit);
      deleted.routeChanges = await deleteBatch(ctx, "routeChanges", limit);
      deleted.dispatchApprovals = await deleteBatch(ctx, "dispatchApprovals", limit);
      deleted.setupCompletions = await deleteBatch(ctx, "setupCompletions", limit);
    }
    return {
      ok: true,
      deleted,
      hasMore: Object.values(deleted).some((count) => count === limit),
    };
  },
});

export const importWorkbookBatch = mutation({
  args: {
    confirm: v.string(),
    importedAt: optionalString,
    productionEntries: v.optional(v.array(v.object(productionEntryValidator))),
    attendanceRecords: v.optional(v.array(v.object(attendanceRecordValidator))),
    trainingRecords: v.optional(v.array(v.object(trainingRecordValidator))),
    routeSelections: v.optional(v.array(v.object(routeSelectionValidator))),
    plannerPriorities: v.optional(v.array(v.object(plannerPriorityValidator))),
    machineConstraints: v.optional(v.array(v.object(machineConstraintValidator))),
    planOverrides: v.optional(v.array(v.object(planOverrideValidator))),
    routeChanges: v.optional(v.array(v.object(routeChangeValidator))),
    dispatchApprovals: v.optional(v.array(v.object(dispatchApprovalValidator))),
    setupCompletions: v.optional(v.array(v.object(setupCompletionValidator))),
    dataEntries: v.optional(v.array(v.object(dataEntryValidator))),
  },
  handler: async (ctx, args) => {
    await requireDashboardUserId(ctx);
    if (args.confirm !== importConfirmation) {
      throw new Error(`Pass confirm: "${importConfirmation}" to import workbook data.`);
    }
    if ((args.dataEntries?.length ?? 0) > 100) {
      throw new Error("Large master imports must use scripts/import-workbook.mjs to avoid browser timeouts and partial uploads.");
    }
    const importedAt = args.importedAt ?? now();
    return {
      ok: true,
      inserted: {
        productionEntries: await insertImportedRows(ctx, "productionEntries", args.productionEntries ?? [], importedAt),
        attendanceRecords: await insertImportedRows(ctx, "attendanceRecords", args.attendanceRecords ?? [], importedAt),
        trainingRecords: await insertImportedRows(ctx, "trainingRecords", args.trainingRecords ?? [], importedAt),
        routeSelections: await insertImportedRows(ctx, "routeSelections", args.routeSelections ?? [], importedAt),
        plannerPriorities: await insertImportedRows(ctx, "plannerPriorities", args.plannerPriorities ?? [], importedAt),
        machineConstraints: await insertImportedRows(ctx, "machineConstraints", args.machineConstraints ?? [], importedAt),
        planOverrides: await insertImportedRows(ctx, "planOverrides", args.planOverrides ?? [], importedAt),
        routeChanges: await insertImportedRows(ctx, "routeChanges", args.routeChanges ?? [], importedAt),
        dispatchApprovals: await insertImportedRows(ctx, "dispatchApprovals", args.dispatchApprovals ?? [], importedAt),
        setupCompletions: await insertImportedRows(ctx, "setupCompletions", args.setupCompletions ?? [], importedAt),
        dataEntries: await insertImportedRows(ctx, "dataEntries", args.dataEntries ?? [], importedAt),
      },
    };
  },
});

async function insertOwnerRow<
  TableName extends
    | "routeSelections"
    | "plannerPriorities"
    | "machineConstraints"
    | "planOverrides"
    | "routeChanges"
    | "dispatchApprovals"
    | "setupCompletions"
    | "dataEntries",
>(
  ctx: MutationCtx,
  table: TableName,
  args: Record<string, unknown>,
): Promise<{ ok: true; id: Id<TableName> }> {
  const ownerFields = await getGlobalOwnerFields(ctx);
  const id = await ctx.db.insert(table, {
    ...args,
    ...ownerFields,
    createdAt: now(),
  } as never);
  return { ok: true, id };
}

async function deleteBatch<TableName extends WorkbookTable>(
  ctx: MutationCtx,
  table: TableName,
  limit: number,
) {
  const rows = await ctx.db.query(table).take(limit);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function insertImportedRows<TableName extends WorkbookTable>(
  ctx: MutationCtx,
  table: TableName,
  rows: Array<Record<string, unknown>>,
  importedAt: string,
) {
  const ownerFields = await getGlobalOwnerFields(ctx);
  for (const row of rows) {
    await ctx.db.insert(table, {
      ...row,
      ...ownerFields,
      createdAt: typeof row.createdAt === "string" && row.createdAt ? row.createdAt : importedAt,
    } as never);
  }
  return rows.length;
}
