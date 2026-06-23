import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { buildLegacyDashboardSnapshot } from "../lib/legacy-dashboard-analysis";

async function requireDashboardUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Authentication is required to access the dashboard.");
  }
  return userId;
}

async function getOwnerFields(ctx: QueryCtx | MutationCtx) {
  return { ownerId: await requireDashboardUserId(ctx) };
}

const optionalString = v.optional(v.string());
const optionalNumber = v.optional(v.number());
const importConfirmation = "replace-workbook-import";
const plannerActionConfirmation = "replace-workbook-and-planner-actions";
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
] as const;

type WorkbookTable = typeof workbookTables[number];

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
  priority: v.string(),
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
    await requireDashboardUserId(ctx);
    const [
      productionEntries,
      attendanceRecords,
      trainingRecords,
      routeSelections,
      plannerPriorities,
      machineConstraints,
      planOverrides,
      routeChanges,
      dispatchApprovals,
      setupCompletions,
    ] = await Promise.all([
      ctx.db.query("productionEntries").collect(),
      ctx.db.query("attendanceRecords").collect(),
      ctx.db.query("trainingRecords").collect(),
      ctx.db.query("routeSelections").collect(),
      ctx.db.query("plannerPriorities").collect(),
      ctx.db.query("machineConstraints").collect(),
      ctx.db.query("planOverrides").collect(),
      ctx.db.query("routeChanges").collect(),
      ctx.db.query("dispatchApprovals").collect(),
      ctx.db.query("setupCompletions").collect(),
    ]);
    const [entryGroups, summaryEntries] = await Promise.all([
      Promise.all(snapshotEntryTypes.map((entryType) => dataEntriesByType(ctx, entryType))),
      dataEntriesByTypeKey(ctx, "_summary", "counts"),
    ]);
    const dataEntries = [...entryGroups.flat(), ...summaryEntries];

    const snapshot = buildLegacyDashboardSnapshot({
      workbookName: "Convex",
      productionEntries,
      attendanceRecords,
      trainingRecords,
      dataEntries,
      routeSelections,
      plannerPriorities,
      machineConstraints,
      planOverrides,
      routeChanges,
      dispatchApprovals,
      setupCompletions,
      updatedAt: latestCreatedAt(
        productionEntries,
        attendanceRecords,
        trainingRecords,
        routeSelections,
        plannerPriorities,
        machineConstraints,
        planOverrides,
        routeChanges,
        dispatchApprovals,
        setupCompletions,
        dataEntries,
      ),
      filters: {
        operatorId: args.operatorId,
        machineType: args.machineType,
        machine: args.machine,
        month: args.month,
        startDate: args.startDate,
        endDate: args.endDate,
      },
    });
    const liveCounts = countRowsByEntryType(dataEntries);

    return {
      ...snapshot,
      dataEntry: {
        ...snapshot.dataEntry,
        templates: legacyEntryTypes.map((entryType) => ({ entryType, format: "xlsx" })),
        keySummary: legacyEntryTypes.map((entryType) => ({
          entryType,
          rows: liveCounts[entryType] ?? 0,
        })),
        entryTypes: legacyEntryTypes,
      },
    };
  },
});

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
  "setup_checklist",
];

const snapshotEntryTypes = legacyEntryTypes;

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

async function dataEntriesByType(ctx: QueryCtx, entryType: string) {
  return ctx.db
    .query("dataEntries")
    .withIndex("by_entry_type", (q) => q.eq("entryType", entryType))
    .collect();
}

async function dataEntriesByTypeKey(ctx: QueryCtx, entryType: string, key: string) {
  return ctx.db
    .query("dataEntries")
    .withIndex("by_entry_type_key", (q) => q.eq("entryType", entryType).eq("key", key))
    .collect();
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
    const ownerFields = await getOwnerFields(ctx);
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
    const ownerFields = await getOwnerFields(ctx);
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
    const ownerFields = await getOwnerFields(ctx);
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
  args: { target: v.string(), priority: v.string(), remark: optionalString },
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
    const ownerFields = await getOwnerFields(ctx);
    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.ownerId !== ownerFields.ownerId) {
        throw new Error("Setup checklist entry was not found or cannot be edited.");
      }
      await ctx.db.patch(args.id, {
        entryType: args.entryType,
        key: args.key,
        payload: args.payload,
        createdAt: now(),
      });
      return { ok: true, id: args.id };
    }
    return insertOwnerRow(ctx, "dataEntries", args);
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
  const ownerFields = await getOwnerFields(ctx);
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
  const ownerFields = await getOwnerFields(ctx);
  for (const row of rows) {
    await ctx.db.insert(table, {
      ...row,
      ...ownerFields,
      createdAt: typeof row.createdAt === "string" && row.createdAt ? row.createdAt : importedAt,
    } as never);
  }
  return rows.length;
}
