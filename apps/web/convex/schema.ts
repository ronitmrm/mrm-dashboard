import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const productionEntryFields = {
  prodDate: v.string(),
  operatorId: v.string(),
  operatorName: v.optional(v.string()),
  machineType: v.string(),
  machine: v.string(),
  partCode: v.string(),
  jobCard: v.optional(v.string()),
  setupNo: v.optional(v.string()),
  outputQty: v.number(),
  actualQty: v.optional(v.number()),
  targetQty: v.number(),
  rejectQty: v.number(),
  rejectionType: v.optional(v.string()),
  rejectionRemark: v.optional(v.string()),
  downtimeMinutes: v.optional(v.number()),
  downtimeReason: v.optional(v.string()),
};

export default defineSchema({
  ...authTables,
  productionEntries: defineTable({
    ...productionEntryFields,
    ownerId: v.optional(v.id("users")),
    createdAt: v.string(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_date", ["ownerId", "prodDate"])
    .index("by_owner_machine_type", ["ownerId", "machineType"])
    .index("by_owner_machine", ["ownerId", "machine"]),
  attendanceRecords: defineTable({
    ownerId: v.optional(v.id("users")),
    operatorId: v.string(),
    operatorName: v.optional(v.string()),
    monthKey: v.string(),
    workingDays: v.number(),
    presentDays: v.number(),
    score: v.optional(v.number()),
    createdAt: v.string(),
  }).index("by_owner", ["ownerId"]),
  trainingRecords: defineTable({
    ownerId: v.optional(v.id("users")),
    operatorId: v.string(),
    operatorName: v.optional(v.string()),
    department: v.optional(v.string()),
    date: v.optional(v.string()),
    trainingType: v.string(),
    reason: v.optional(v.string()),
    trainer: v.optional(v.string()),
    status: v.string(),
    createdAt: v.string(),
  }).index("by_owner", ["ownerId"]),
  routeSelections: defineTable({
    ownerId: v.optional(v.id("users")),
    jcNo: v.string(),
    optionNumber: v.string(),
    createdAt: v.string(),
  }).index("by_owner", ["ownerId"]),
  plannerPriorities: defineTable({
    ownerId: v.optional(v.id("users")),
    target: v.string(),
    jcNo: v.optional(v.string()),
    partCode: v.optional(v.string()),
    priority: v.string(),
    remark: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_owner", ["ownerId"]),
  machineConstraints: defineTable({
    ownerId: v.optional(v.id("users")),
    machineNo: v.string(),
    unavailableFrom: v.string(),
    unavailableTo: v.string(),
    reason: v.string(),
    remark: v.optional(v.string()),
    rescheduleAction: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_owner", ["ownerId"]),
  planOverrides: defineTable({
    ownerId: v.optional(v.id("users")),
    target: v.string(),
    toMachine: v.string(),
    setupNo: v.optional(v.string()),
    fromMachine: v.optional(v.string()),
    reason: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_owner", ["ownerId"]),
  routeChanges: defineTable({
    ownerId: v.optional(v.id("users")),
    target: v.string(),
    newOption: v.string(),
    changeAfterSetup: v.optional(v.string()),
    applyFromSetup: v.optional(v.string()),
    wipQty: v.optional(v.number()),
    remainingSetups: v.optional(v.array(v.object({
      setupNo: v.string(),
      plan: v.boolean(),
      quantity: v.number(),
      remark: v.optional(v.string()),
    }))),
    reason: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_owner", ["ownerId"]),
  dispatchApprovals: defineTable({
    ownerId: v.optional(v.id("users")),
    jcNo: v.string(),
    approvedBy: v.string(),
    remark: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_owner", ["ownerId"]),
  setupCompletions: defineTable({
    ownerId: v.optional(v.id("users")),
    jcNo: v.string(),
    completedBy: v.string(),
    remark: v.optional(v.string()),
    setupNo: v.optional(v.string()),
    machine: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_owner", ["ownerId"]),
  dataEntries: defineTable({
    ownerId: v.optional(v.id("users")),
    entryType: v.string(),
    key: v.optional(v.string()),
    payload: v.any(),
    createdAt: v.string(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_entry_type", ["entryType"])
    .index("by_entry_type_key", ["entryType", "key"]),
  corrections: defineTable({
    ownerId: v.optional(v.id("users")),
    targetTable: v.string(),
    targetId: v.string(),
    targetKey: v.optional(v.string()),
    targetLabel: v.optional(v.string()),
    action: v.string(),
    reason: v.string(),
    correctedBy: v.string(),
    correctedPayload: v.optional(v.any()),
    createdAt: v.string(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_target", ["targetTable", "targetId"]),
});
