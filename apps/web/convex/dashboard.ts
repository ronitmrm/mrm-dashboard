import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { buildLegacyDashboardSnapshot } from "../lib/legacy-dashboard-analysis";
import {
  beginDashboardRefreshRun,
  dashboardRefreshStatus,
  finishDashboardRefreshRun,
  requestDashboardRefresh as requestDashboardRefreshState,
  type DashboardRefreshState,
  type DashboardRefreshStatusSummary,
} from "../lib/dashboard-refresh-state";
import {
  activeCorrectionTargetKeys,
  dataEntryCorrectionTargetsWithWorkflowCascade,
  latestUncorrectedRow,
  type CorrectionTargetRow,
  type DataEntryCorrectionRow,
} from "../lib/dashboard-corrections";
import { shouldQueuePlanningRefresh } from "../lib/planning-refresh-policy";

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

export const currentDashboardUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireDashboardUserId(ctx);
    const user = await ctx.db.get(userId);
    return {
      userId,
      email: user?.email ?? "",
      name: user?.name ?? "",
      displayId: user?.email || user?.name || userId,
    };
  },
});
async function getGlobalOwnerFields(ctx: QueryCtx | MutationCtx) {
  await requireDashboardAccess(ctx);
  return { ownerId: undefined };
}

const optionalString = v.optional(v.string());
const optionalNumber = v.optional(v.number());
const importConfirmation = "replace-workbook-import";
const plannerActionConfirmation = "replace-workbook-and-planner-actions";
const dashboardSnapshotFreshForMs = 5 * 60 * 1000;
const dashboardRefreshStateKey = "global";
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
type RefreshSnapshotResult = {
  ok: true;
  skipped: boolean;
  updatedAt?: string;
  queued?: boolean;
  status?: DashboardRefreshStatusSummary["status"];
  isRefreshing?: boolean;
  lastError?: string;
};
type DashboardRefreshStateRow = {
  _id: Id<"dashboardRefreshState">;
  key: string;
  status: string;
  requestedAtMs: number;
  scheduledAtMs?: number;
  startedAtMs?: number;
  runRequestedAtMs?: number;
  completedAtMs?: number;
  lastError?: string;
};

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
  queueBeforeSetups: v.optional(v.array(v.object({
    targetSetupNo: v.string(),
    jcNo: v.string(),
    setupNo: v.string(),
    machine: v.string(),
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
  planningMode: optionalString,
  interruptedSetups: v.optional(v.array(v.object({
    jcNo: v.string(),
    setupNo: v.string(),
    machine: v.string(),
    finishedQty: optionalNumber,
  }))),
  queuePlacements: v.optional(v.array(v.object({
    targetJcNo: v.string(),
    targetPartCode: optionalString,
    targetSetupNo: v.string(),
    targetSourceMachine: optionalString,
    targetMachine: v.string(),
    queueBeforeSetups: v.optional(v.array(v.object({
      jcNo: v.string(),
      setupNo: v.string(),
      machine: v.string(),
    }))),
  }))),
  createdAt: optionalString,
};
const planOverrideValidator = {
  target: v.string(),
  toMachine: v.string(),
  setupNo: optionalString,
  fromMachine: optionalString,
  interruptedSetups: v.optional(v.array(v.object({
    jcNo: v.string(),
    setupNo: v.string(),
    machine: v.string(),
    finishedQty: optionalNumber,
  }))),
  queuePlacements: v.optional(v.array(v.object({
    targetJcNo: v.string(),
    targetPartCode: optionalString,
    targetSetupNo: v.string(),
    targetSourceMachine: optionalString,
    targetMachine: v.string(),
    queueBeforeSetups: v.optional(v.array(v.object({
      jcNo: v.string(),
      setupNo: v.string(),
      machine: v.string(),
    }))),
  }))),
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

function nowMs() {
  return Date.now();
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


export const masterTableRows = query({
  args: {
    entryType: v.string(),
  },
  handler: async (ctx, args) => {
    await requireDashboardAccess(ctx);
    if (!legacyEntryTypes.includes(args.entryType)) return { rows: [], totalRows: 0 };
    const ownerFields = await getGlobalOwnerFields(ctx);
    const rows = await ctx.db
      .query("dataEntries")
      .withIndex("by_entry_type", (q) => q.eq("entryType", args.entryType))
      .collect();
    const ownerRows = rows.filter((row) => row.ownerId === ownerFields.ownerId);
    const corrections = await ctx.db
      .query("corrections")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerFields.ownerId))
      .collect() as CorrectionTargetRow[];
    const correctionTargets = dataEntryCorrectionTargetsWithWorkflowCascade(
      ownerRows as DataEntryCorrectionRow[],
      activeCorrectionTargetKeys(corrections),
      corrections,
    );
    const activeRows = withoutCorrectedRows(ownerRows, "dataEntries", correctionTargets);
    return {
      rows: activeRows.map((row) => ({
        ...payloadRecord(row.payload),
        entryType: row.entryType,
        key: row.key,
        createdAt: row.createdAt,
      })),
      totalRows: activeRows.length,
    };
  },
});
export const hourlyQualityPage = query({
  args: {},
  handler: async (ctx) => {
    await requireDashboardAccess(ctx);
    const ownerFields = await getGlobalOwnerFields(ctx);
    const cached = await readDashboardSnapshotPayload(ctx, null);
    const productionControl = payloadRecord(payloadRecord(cached).productionControl);
    const runningRows = currentShopFloorRowsForPage(
      arrayRecords(productionControl.machinePlanningRows),
      arrayRecords(productionControl.machinePlanDetailRows),
    );
    const parameterRows = await ctx.db
      .query("dataEntries")
      .withIndex("by_entry_type", (q) => q.eq("entryType", "quality_parameter_master"))
      .collect();
    return {
      runningRows,
      qualityParameterMasterRows: latestPayloadRowsByKey(
        parameterRows.filter((row) => row.ownerId === ownerFields.ownerId).map((row) => payloadRecord(row.payload)),
        qualityParameterMasterPayloadKey,
      ),
    };
  },
});

export const hourlyQualityCheckByKey = query({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await requireDashboardAccess(ctx);
    const ownerFields = await getGlobalOwnerFields(ctx);
    const rows = await ctx.db
      .query("dataEntries")
      .withIndex("by_owner_entry_type_key", (q) => q
        .eq("ownerId", ownerFields.ownerId)
        .eq("entryType", "hourly_quality_check")
        .eq("key", args.key))
      .order("desc")
      .take(20);
    const correctionTargets = await activeCorrectionTargetsForRows(ctx, "dataEntries", rows);
    const row = latestUncorrectedRow(rows, "dataEntries", correctionTargets);
    return row ? payloadRecord(row.payload) : null;
  },
});

export const setupChecklistPage = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireDashboardAccess(ctx);
    const ownerFields = await getGlobalOwnerFields(ctx);
    const masterRows = await ctx.db
      .query("dataEntries")
      .withIndex("by_entry_type", (q) => q.eq("entryType", "setup_checklist_master"))
      .collect();
    const sessionRows = args.sessionId
      ? await ctx.db
        .query("dataEntries")
        .withIndex("by_owner_entry_type_key", (q) => q
          .eq("ownerId", ownerFields.ownerId)
          .eq("entryType", "setup_checklist_session")
          .eq("key", args.sessionId))
        .order("desc")
        .take(20)
      : [];
    const sessionCorrectionTargets = await activeCorrectionTargetsForRows(ctx, "dataEntries", sessionRows);
    const session = latestUncorrectedRow(sessionRows, "dataEntries", sessionCorrectionTargets);
    return {
      setupChecklistMasterRows: masterRows
        .filter((row) => row.ownerId === ownerFields.ownerId)
        .map((row) => payloadRecord(row.payload)),
      setupChecklistSession: session ? payloadRecord(session.payload) : undefined,
    };
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
        nowMs: nowMs(),
      });
      if (freshness.fresh) {
        return { ok: true, skipped: true, updatedAt: freshness.updatedAt };
      }
    }

    const queued: DashboardRefreshStatusSummary & { scheduled: boolean } = await ctx.runMutation(internal.dashboard.requestDashboardRefresh, {
      requestedAtMs: nowMs(),
    });
    return {
      ok: true,
      skipped: false,
      queued: true,
      status: queued.status,
      isRefreshing: queued.isRefreshing,
      lastError: queued.lastError,
    };
  },
});

export const refreshStatus = query({
  args: {},
  handler: async (ctx): Promise<DashboardRefreshStatusSummary> => {
    await requireDashboardAccess(ctx);
    const row = await dashboardRefreshStateRow(ctx);
    return dashboardRefreshStatus(row ? dashboardRefreshStateFromRow(row) : null);
  },
});

export const refreshSnapshotInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<RefreshSnapshotResult> => {
    const started: { shouldRun: boolean; runRequestedAtMs?: number } = await ctx.runMutation(internal.dashboard.beginDashboardRefresh, {
      startedAtMs: nowMs(),
    });
    if (!started.shouldRun || started.runRequestedAtMs === undefined) {
      return { ok: true, skipped: true };
    }

    let error: string | null = null;
    let result: RefreshSnapshotResult | null = null;
    try {
      result = await rebuildDashboardSnapshot(ctx, { force: true });
    } catch (err) {
      error = err instanceof Error ? err.message : "Planning refresh failed.";
    }

    await ctx.runMutation(internal.dashboard.finishDashboardRefresh, {
      runRequestedAtMs: started.runRequestedAtMs,
      completedAtMs: nowMs(),
      error,
    });

    if (error) throw new Error(error);
    return result ?? { ok: true, skipped: true };
  },
});

async function rebuildDashboardSnapshot(
  ctx: ActionCtx,
  args: { force?: boolean },
): Promise<RefreshSnapshotResult> {
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
  const previousMachinePlanDetailRows: Array<Record<string, unknown>> = await ctx.runQuery(internal.dashboard.latestMachinePlanDetailRows, {});
  const payload = buildDashboardSnapshotPayload(source, previousMachinePlanDetailRows);
  const saveResult: { ok: true; changed: boolean; updatedAt?: string } = await ctx.runMutation(internal.dashboard.saveDashboardSnapshot, { payload, cacheUpdatedAt: now() });
  return { ok: true, skipped: !saveResult.changed, updatedAt: saveResult.updatedAt ?? payload.updatedAt };
}

export const latestMachinePlanDetailRows = internalQuery({
  args: {},
  handler: async (ctx) => {
    const chunks = await latestDashboardSnapshotChunks(ctx, null);
    if (!chunks.length) return [];
    let payload: unknown;
    try {
      payload = JSON.parse(serializedSnapshotChunks(chunks));
    } catch {
      return [];
    }
    const productionControl = typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? (payload as { productionControl?: unknown }).productionControl
      : undefined;
    const machinePlanDetailRows = typeof productionControl === "object" && productionControl !== null && !Array.isArray(productionControl)
      ? (productionControl as { machinePlanDetailRows?: unknown }).machinePlanDetailRows
      : undefined;
    if (!Array.isArray(machinePlanDetailRows)) return [];
    return machinePlanDetailRows.map((row) => {
      const record = typeof row === "object" && row !== null && !Array.isArray(row) ? row as Record<string, unknown> : {};
      return {
        jcNo: record.jcNo,
        partCode: record.partCode,
        optionNumber: record.optionNumber,
        setupNo: record.setupNo,
        routeMachine: record.routeMachine,
        machine: record.machine,
      };
    });
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

export const beginDashboardRefresh = internalMutation({
  args: {
    startedAtMs: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await dashboardRefreshStateRow(ctx);
    const transition = beginDashboardRefreshRun(row ? dashboardRefreshStateFromRow(row) : null, args.startedAtMs);
    if (row && transition.state) {
      await ctx.db.patch(row._id, transition.state);
    }
    return {
      shouldRun: transition.shouldRun,
      runRequestedAtMs: transition.runRequestedAtMs,
    };
  },
});

export const finishDashboardRefresh = internalMutation({
  args: {
    runRequestedAtMs: v.number(),
    completedAtMs: v.number(),
    error: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const row = await dashboardRefreshStateRow(ctx);
    if (!row) return { ok: true, scheduled: false };

    const transition = finishDashboardRefreshRun(
      dashboardRefreshStateFromRow(row),
      args.runRequestedAtMs,
      args.completedAtMs,
      args.error,
    );
    await ctx.db.patch(row._id, transition.state);
    if (transition.shouldSchedule) {
      await ctx.scheduler.runAfter(0, internal.dashboard.refreshSnapshotInternal, {});
    }
    return { ok: true, scheduled: transition.shouldSchedule };
  },
});

export const requestDashboardRefresh = internalMutation({
  args: {
    requestedAtMs: v.number(),
  },
  handler: async (ctx, args): Promise<DashboardRefreshStatusSummary & { scheduled: boolean }> => {
    return queueDashboardRefresh(ctx, args.requestedAtMs);
  },
});

async function queueDashboardRefresh(ctx: MutationCtx, requestedAtMs = nowMs()): Promise<DashboardRefreshStatusSummary & { scheduled: boolean }> {
  const row = await dashboardRefreshStateRow(ctx);
  const transition = requestDashboardRefreshState(row ? dashboardRefreshStateFromRow(row) : null, requestedAtMs);

  if (row) {
    await ctx.db.patch(row._id, transition.state);
  } else {
    await ctx.db.insert("dashboardRefreshState", {
      key: dashboardRefreshStateKey,
      ...transition.state,
    });
  }

  if (transition.shouldSchedule) {
    await ctx.scheduler.runAfter(0, internal.dashboard.refreshSnapshotInternal, {});
  }

  return {
    ...dashboardRefreshStatus(transition.state),
    scheduled: transition.shouldSchedule,
  };
}

async function dashboardRefreshStateRow(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("dashboardRefreshState")
    .withIndex("by_key", (q) => q.eq("key", dashboardRefreshStateKey))
    .unique();
}

function dashboardRefreshStateFromRow(row: DashboardRefreshStateRow): DashboardRefreshState {
  return {
    status: row.status as DashboardRefreshState["status"],
    requestedAtMs: row.requestedAtMs,
    scheduledAtMs: row.scheduledAtMs,
    startedAtMs: row.startedAtMs,
    runRequestedAtMs: row.runRequestedAtMs,
    completedAtMs: row.completedAtMs,
    lastError: row.lastError,
  };
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
  const snapshotCacheUpdatedAt = latestSnapshotChunkUpdatedAt(chunks);
  const payload = JSON.parse(chunks.sort((a, b) => a.sequence - b.sequence).map((row) => row.chunk).join(""));
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return payload;
  return {
    ...payload,
    snapshotCacheUpdatedAt,
  };
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
    for (const row of exactExisting) {
      await ctx.db.patch(row._id, { updatedAt });
    }
    return {
      changed: false,
      updatedAt,
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

function buildDashboardSnapshotPayload(source: SnapshotSource, previousMachinePlanDetailRows: Array<Record<string, unknown>> = []) {
  const correctionTargets = dataEntryCorrectionTargetsWithWorkflowCascade(
    source.allDataEntries,
    activeCorrectionTargetKeys(source.corrections),
    source.corrections,
  );
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
    previousMachinePlanDetailRows,
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
  "setup_checklist_master",
  "setup_checklist_session",
  "production_card",
  "quality_parameter_master",
  "hourly_quality_check",
  "maintenance_master",
  "maintenance_checklist_master",
  "maintenance_schedule",
  "maintenance_task",
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

function arrayRecords(value: unknown) {
  return Array.isArray(value)
    ? value.map(payloadRecord).filter((row) => Object.keys(row).length)
    : [];
}

function textValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function pageDisplayValue(value: unknown) {
  const text = textValue(value);
  return text || "-";
}

function pageMachineKey(value: unknown) {
  return textValue(value).toLowerCase();
}

function pageMachineValue(row: Record<string, unknown>, type: "machine" | "machineType") {
  if (type === "machine") return pageDisplayValue(row.machine || row.machineNo || row["MACHINE NO"] || row["M/C NO"] || row["MACHINE NO."]);
  return pageDisplayValue(row.machineType || row["MACHINE TYPE"] || row.type || row.TYPE);
}


function pageItemCode(row: Record<string, unknown>) {
  return pageDisplayValue(row.partCode || row["PART CODE"] || row.itemCode);
}

function pagePlannedSetupDate(row: Record<string, unknown>) {
  return row.plannedProductionStartDate || row.setupPlannedDate || row.plannedDate;
}

function pageDateSortValue(value: unknown) {
  const text = textValue(value);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function pagePlanningRowIsBreakdownStopped(row: Record<string, unknown>) {
  return textValue(row.runningStatus).toLowerCase() === "breakdown stopped";
}

function pagePlanningRowIsShiftedAfterBreakdown(row: Record<string, unknown>) {
  const status = textValue(row.runningStatus).toLowerCase();
  return status === "plan shifted" || status === "plan delayed";
}

function pageShopFloorItemIsCurrent(row: Record<string, unknown>) {
  if (pagePlanningRowIsBreakdownStopped(row) || pagePlanningRowIsShiftedAfterBreakdown(row)) return false;
  return ["operator_started", "worker_start"].includes(textValue(row.shopFloorStage))
    || textValue(row.runningStatus).toLowerCase() === "running"
    || Number(row.rawRows) > 0
    || Number(row.rawOutputQty) > 0
    || Number(row.rawActualQty) > 0;
}

function pageShopFloorPlanSort(a: Record<string, unknown>, b: Record<string, unknown>) {
  return pageDateSortValue(pagePlannedSetupDate(a)) - pageDateSortValue(pagePlannedSetupDate(b))
    || pageDisplayValue(a.setupNo).localeCompare(pageDisplayValue(b.setupNo), undefined, { numeric: true })
    || pageItemCode(a).localeCompare(pageItemCode(b), undefined, { numeric: true });
}

function currentShopFloorRowsForPage(machineRows: Record<string, unknown>[], plannedRows: Record<string, unknown>[]) {
  const rowsByMachine = new Map<string, Record<string, unknown>>();
  for (const row of machineRows) {
    const key = pageMachineKey(pageMachineValue(row, "machine"));
    if (key) rowsByMachine.set(key, row);
  }
  for (const row of plannedRows) {
    const machine = pageMachineValue(row, "machine");
    const key = pageMachineKey(machine);
    if (!key || rowsByMachine.has(key)) continue;
    rowsByMachine.set(key, { machine, machineNo: machine, machineType: pageMachineValue(row, "machineType") });
  }
  const plannedByMachine = new Map<string, Record<string, unknown>[]>();
  for (const row of plannedRows) {
    const key = pageMachineKey(pageMachineValue(row, "machine"));
    if (!key) continue;
    const rows = plannedByMachine.get(key) ?? [];
    rows.push(row);
    plannedByMachine.set(key, rows);
  }
  return [...rowsByMachine.values()]
    .sort((a, b) => pageMachineValue(a, "machine").localeCompare(pageMachineValue(b, "machine"), undefined, { numeric: true }))
    .map((machineRow) => {
      const rows = plannedByMachine.get(pageMachineKey(pageMachineValue(machineRow, "machine"))) ?? [];
      return rows
        .filter((row) => textValue(row.shopFloorStage) !== "item_complete")
        .filter(pageShopFloorItemIsCurrent)
        .sort(pageShopFloorPlanSort)[0];
    })
    .filter((row): row is Record<string, unknown> => Boolean(row));
}

function latestPayloadRowsByKey(rows: Record<string, unknown>[], keyFn: (row: Record<string, unknown>) => string) {
  const rowsByKey = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    rowsByKey.set(key, row);
  }
  return [...rowsByKey.values()];
}

function qualityParameterMasterPayloadKey(row: Record<string, unknown>) {
  return [
    row.partNo || row.partCode || row["PART NO"] || row["PART CODE"],
    row.optionNumber || row["OPTION NUMBER"] || row["OPTION NO"],
    row.setupNo || row["SETUP NO."] || row["SETUP NO"] || row["SET UP"],
    row.code || row.parameterCode || row.CODE,
  ].map(pageMachineKey).join("|");
}

function mergeDataEntryPayload(entryType: string, existingPayload: unknown, nextPayload: unknown) {
  if (entryType !== "production_card") return nextPayload;
  const existing = payloadRecord(existingPayload);
  const next = payloadRecord(nextPayload);
  const merged: Record<string, unknown> = { ...existing, ...next };
  for (const [key, value] of Object.entries(next)) {
    if (key === "savedAt") continue;
    const existingValue = existing[key];
    if (isBlankProductionCardValue(value) && !isBlankProductionCardValue(existingValue)) {
      merged[key] = existingValue;
    }
  }
  return merged;
}

function isBlankProductionCardValue(value: unknown) {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value === "number") return value === 0;
  if (typeof value === "object" && !Array.isArray(value)) return Object.keys(payloadRecord(value)).length === 0;
  return false;
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

async function activeCorrectionTargetsForRows(
  ctx: QueryCtx | MutationCtx,
  targetTable: string,
  rows: Array<{ _id: unknown }>,
) {
  const correctionGroups = await Promise.all(rows.map((row) => ctx.db
    .query("corrections")
    .withIndex("by_owner_target", (q) => q
      .eq("ownerId", undefined)
      .eq("targetTable", targetTable)
      .eq("targetId", String(row._id)))
    .collect()));
  const corrections = correctionGroups.flat() as CorrectionTargetRow[];
  const correctionTargets = activeCorrectionTargetKeys(corrections);
  if (targetTable === "dataEntries") {
    return dataEntryCorrectionTargetsWithWorkflowCascade(rows as DataEntryCorrectionRow[], correctionTargets, corrections);
  }
  return correctionTargets;
}

function cleanText(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

const setupLifecycleStageRanks = new Map([
  ["raw_material_at_machine", 0],
  ["presetting", 1],
  ["setting", 2],
  ["quality_approval", 3],
  ["operator_started", 4],
  ["item_complete", 5],
]);

const setupLifecycleStageAliases: Record<string, string> = {
  shop_floor_rm: "raw_material_at_machine",
  raw_material_at_machine: "raw_material_at_machine",
  tools_drawing: "presetting",
  presetting: "presetting",
  setting: "setting",
  qc_approval: "quality_approval",
  quality_approval: "quality_approval",
  worker_start: "operator_started",
  operator_started: "operator_started",
  item_complete: "item_complete",
};

function canonicalText(value: unknown) {
  return cleanText(value).toLowerCase();
}

function normalizeSetupLifecycleStage(value: unknown) {
  return setupLifecycleStageAliases[canonicalText(value)] ?? canonicalText(value);
}

function setupLifecycleStageRank(value: unknown) {
  return setupLifecycleStageRanks.get(normalizeSetupLifecycleStage(value)) ?? -1;
}

function shopFloorStageRequiresMachineLock(value: unknown) {
  return setupLifecycleStageRank(value) >= setupLifecycleStageRank("raw_material_at_machine");
}

function shopFloorStageIsActiveMachineLock(value: unknown) {
  const rank = setupLifecycleStageRank(value);
  return rank >= setupLifecycleStageRank("raw_material_at_machine") && rank < setupLifecycleStageRank("item_complete");
}

function payloadText(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = cleanText(payload[key]);
    if (value) return value;
  }
  return "";
}

function sameText(left: unknown, right: unknown) {
  return canonicalText(left) === canonicalText(right);
}

function sameShopFloorSetup(left: Record<string, unknown>, right: Record<string, unknown>) {
  return sameText(payloadText(left, "jcNo", "jobCard"), payloadText(right, "jcNo", "jobCard"))
    && sameText(payloadText(left, "partCode", "partNo"), payloadText(right, "partCode", "partNo"))
    && sameText(payloadText(left, "optionNumber", "option"), payloadText(right, "optionNumber", "option"))
    && sameText(payloadText(left, "setupNo"), payloadText(right, "setupNo"));
}

function planOverrideMatchesMachineSwitch(row: Record<string, unknown>, target: Record<string, unknown>, lockedMachine: string) {
  const targetCode = payloadText(row, "target");
  if (!targetCode || (!sameText(targetCode, payloadText(target, "jcNo", "jobCard")) && !sameText(targetCode, payloadText(target, "partCode", "partNo")))) return false;
  const setupNo = payloadText(row, "setupNo");
  if (setupNo && !sameText(setupNo, payloadText(target, "setupNo"))) return false;
  const toMachine = payloadText(row, "toMachine");
  if (!toMachine || !sameText(toMachine, payloadText(target, "machine", "machineNo"))) return false;
  const fromMachine = payloadText(row, "fromMachine");
  return !fromMachine || sameText(fromMachine, lockedMachine);
}

async function hasPlannerMachineSwitch(ctx: MutationCtx, target: Record<string, unknown>, lockedMachine: string) {
  const rows = await ctx.db
    .query("planOverrides")
    .withIndex("by_owner", (q) => q.eq("ownerId", undefined))
    .order("desc")
    .take(500);
  const matches = rows.filter((row) => planOverrideMatchesMachineSwitch(row, target, lockedMachine));
  if (!matches.length) return false;
  const correctionTargets = await activeCorrectionTargetsForRows(ctx, "planOverrides", matches);
  return matches.some((row) => !correctionTargets.has(`planOverrides:${String(row._id)}`));
}

async function assertShopFloorMachineLockAllowsSave(ctx: MutationCtx, args: { id?: Id<"dataEntries">; entryType: string; key?: string; payload: unknown }) {
  if (args.entryType !== "shop_floor_status") return;
  const target = payloadRecord(args.payload);
  if (!shopFloorStageRequiresMachineLock(target.stage)) return;
  const targetMachine = payloadText(target, "machine", "machineNo");
  if (!payloadText(target, "jcNo", "jobCard") || !payloadText(target, "partCode", "partNo") || !payloadText(target, "setupNo") || !targetMachine) return;

  const rows = await ctx.db
    .query("dataEntries")
    .withIndex("by_entry_type", (q) => q.eq("entryType", "shop_floor_status"))
    .order("desc")
    .take(1000);
  const candidateLocks = rows.filter((row) => {
    if (row.ownerId !== undefined) return false;
    const payload = payloadRecord(row.payload);
    if (!shopFloorStageIsActiveMachineLock(payload.stage)) return false;
    if (!sameShopFloorSetup(payload, target)) return false;
    return Boolean(payloadText(payload, "machine", "machineNo"));
  });
  if (!candidateLocks.length) return;

  const correctionTargets = await activeCorrectionTargetsForRows(ctx, "dataEntries", candidateLocks);
  const activeLocks = candidateLocks.filter((row) => !correctionTargets.has(`dataEntries:${String(row._id)}`));
  if (!activeLocks.length) return;
  if (activeLocks.some((row) => sameText(payloadText(payloadRecord(row.payload), "machine", "machineNo"), targetMachine))) return;

  const blockingLocks = activeLocks.filter((row) => !sameText(payloadText(payloadRecord(row.payload), "machine", "machineNo"), targetMachine));
  const lockedMachines = [...new Set(blockingLocks.map((row) => payloadText(payloadRecord(row.payload), "machine", "machineNo")).filter(Boolean))];
  for (const lockedMachine of lockedMachines) {
    if (await hasPlannerMachineSwitch(ctx, target, lockedMachine)) return;
  }

  throw new Error(`This setup is already locked to ${lockedMachines.join(", ")} because RM is at the machine. Use planner part-specific machine switch before moving it to ${targetMachine}.`);
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
    await queueDashboardRefresh(ctx);
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
  handler: async (ctx, args) => {
    const result = await insertOwnerRow(ctx, "routeSelections", args);
    await queueDashboardRefresh(ctx);
    return result;
  },
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
    queueBeforeSetups: v.optional(v.array(v.object({
      targetSetupNo: v.string(),
      jcNo: v.string(),
      setupNo: v.string(),
      machine: v.string(),
    }))),
    remark: optionalString,
  },
  handler: async (ctx, args) => {
    const result = await insertOwnerRow(ctx, "plannerPriorities", args);
    await queueDashboardRefresh(ctx);
    return result;
  },
});

export const saveMachineConstraint = mutation({
  args: {
    machineNo: v.string(),
    unavailableFrom: v.string(),
    unavailableTo: v.string(),
    reason: v.string(),
    remark: optionalString,
    rescheduleAction: optionalString,
    planningMode: optionalString,
    interruptedSetups: v.optional(v.array(v.object({
      jcNo: v.string(),
      setupNo: v.string(),
      machine: v.string(),
      finishedQty: optionalNumber,
    }))),
  queuePlacements: v.optional(v.array(v.object({
    targetJcNo: v.string(),
    targetPartCode: optionalString,
    targetSetupNo: v.string(),
    targetSourceMachine: optionalString,
    targetMachine: v.string(),
    queueBeforeSetups: v.optional(v.array(v.object({
      jcNo: v.string(),
      setupNo: v.string(),
      machine: v.string(),
    }))),
  }))),
  },
  handler: async (ctx, args) => {
    const result = await insertOwnerRow(ctx, "machineConstraints", args);
    await queueDashboardRefresh(ctx);
    return result;
  },
});

export const savePlanOverride = mutation({
  args: {
    target: v.string(),
    toMachine: v.string(),
    setupNo: optionalString,
    fromMachine: optionalString,
      interruptedSetups: v.optional(v.array(v.object({
        jcNo: v.string(),
        setupNo: v.string(),
        machine: v.string(),
        finishedQty: optionalNumber,
      }))),
      queuePlacements: v.optional(v.array(v.object({
        targetJcNo: v.string(),
        targetPartCode: optionalString,
        targetSetupNo: v.string(),
        targetSourceMachine: optionalString,
        targetMachine: v.string(),
        queueBeforeSetups: v.optional(v.array(v.object({
          jcNo: v.string(),
          setupNo: v.string(),
          machine: v.string(),
        }))),
      }))),
    reason: optionalString,
  },
  handler: async (ctx, args) => {
    const result = await insertOwnerRow(ctx, "planOverrides", args);
    await queueDashboardRefresh(ctx);
    return result;
  },
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
  handler: async (ctx, args) => {
    const result = await insertOwnerRow(ctx, "routeChanges", args);
    await queueDashboardRefresh(ctx);
    return result;
  },
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
  handler: async (ctx, args) => {
    const result = await insertOwnerRow(ctx, "setupCompletions", args);
    await queueDashboardRefresh(ctx);
    return result;
  },
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
    await assertShopFloorMachineLockAllowsSave(ctx, args);
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) {
        throw new Error("Setup checklist entry was not found or cannot be edited.");
      }
      const mergedPayload = mergeDataEntryPayload(args.entryType, existing.payload, args.payload);
      await ctx.db.patch(args.id, {
        entryType: args.entryType,
        key: args.key,
        payload: mergedPayload,
        ...ownerFields,
        createdAt: now(),
      });
      if (shouldQueuePlanningRefresh("data-entry", { entryType: args.entryType, payload: mergedPayload })) {
        await queueDashboardRefresh(ctx);
      }
      return { ok: true, id: args.id };
    }
    if (args.key) {
      const existingRows = await ctx.db
        .query("dataEntries")
        .withIndex("by_owner_entry_type_key", (q) => q
          .eq("ownerId", ownerFields.ownerId)
          .eq("entryType", args.entryType)
          .eq("key", args.key))
        .order("desc")
        .take(20);
      const correctionTargets = await activeCorrectionTargetsForRows(ctx, "dataEntries", existingRows);
      const existing = latestUncorrectedRow(existingRows, "dataEntries", correctionTargets);
      if (existing) {
        const mergedPayload = mergeDataEntryPayload(args.entryType, existing.payload, args.payload);
        await ctx.db.patch(existing._id, {
          entryType: args.entryType,
          key: args.key,
          payload: mergedPayload,
          ...ownerFields,
          createdAt: now(),
        });
        if (shouldQueuePlanningRefresh("data-entry", { entryType: args.entryType, payload: mergedPayload })) {
          await queueDashboardRefresh(ctx);
        }
        return { ok: true, id: existing._id };
      }
    }
    const result = await insertOwnerRow(ctx, "dataEntries", args);
    if (shouldQueuePlanningRefresh("data-entry", { entryType: args.entryType, payload: args.payload })) {
      await queueDashboardRefresh(ctx);
    }
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
    const targetDataEntry = args.targetTable === "dataEntries"
      ? await ctx.db.get(args.targetId as Id<"dataEntries">)
      : null;
    const id = await ctx.db.insert("corrections", {
      ...args,
      action: "reverse",
      ...ownerFields,
      createdAt: now(),
    });
    if (shouldQueuePlanningRefresh("reverse-entry", {
      targetTable: args.targetTable,
      entryType: targetDataEntry?.entryType,
      payload: targetDataEntry?.payload,
    })) {
      await queueDashboardRefresh(ctx);
    }
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
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 200), 1), 200);
    const tableNames = correctionCandidateTables.filter((table) => !args.targetTable || table === args.targetTable);
    const results = [];
    for (const table of tableNames) {
      const rows = await globalCorrectionCandidateRows(ctx, table, limit);
      const correctionTargets = await activeCorrectionTargetsForRows(ctx, table, rows);
      for (const row of rows) {
        if (correctionTargets.has(`${table}:${String(row._id)}`)) continue;
        results.push(correctionCandidate(table, row));
      }
    }
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
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
