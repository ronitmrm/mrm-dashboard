import {
  bigint,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

const catalog = pgSchema("catalog")

export const items = catalog.table("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  uid: text("uid").notNull(),
  uidKind: text("uid_kind").notNull().default("INTERNAL"),
  lifecycleStatus: text("lifecycle_status").notNull().default("P"),
  description: text("description").notNull(),
  itemType: text("item_type").notNull().default("List"),
  productionType: text("production_type"),
  materialGradeId: uuid("material_grade_id"),
  rodSize: text("rod_size"),
  rodTypeId: uuid("rod_type_id"),
  dieCode: text("die_code"),
  weight100Pcs: numeric("weight_100_pcs", {
    precision: 20,
    scale: 8,
  })
    .notNull()
    .default("0"),
  casting: numeric("casting", { precision: 20, scale: 8 })
    .notNull()
    .default("1"),
  alloyPremium: numeric("alloy_premium", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  extrusionCost: numeric("extrusion_cost", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  forgingCost: numeric("forging_cost", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  pricingMethod: text("pricing_method").notNull().default("Derived"),
  piecesPerKg: numeric("pieces_per_kg", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  directPurchasePricePerKg: numeric("direct_purchase_price_per_kg", {
    precision: 20,
    scale: 8,
  })
    .notNull()
    .default("0"),
  directPurchasePricePerPiece: numeric("direct_purchase_price_per_piece", {
    precision: 20,
    scale: 8,
  })
    .notNull()
    .default("0"),
  productCostInr: numeric("product_cost_inr", {
    precision: 20,
    scale: 8,
  })
    .notNull()
    .default("0"),
  machiningPricePerPiece: numeric("machining_price_per_piece", {
    precision: 20,
    scale: 8,
  })
    .notNull()
    .default("0"),
  machineTypeId: uuid("machine_type_id"),
  machiningCost: numeric("machining_cost", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  washing: numeric("washing", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  checking: numeric("checking", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  marking: numeric("marking", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  plating: numeric("plating", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  annealing: numeric("annealing", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  deburring: numeric("deburring", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  buffing: numeric("buffing", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  sealant: numeric("sealant", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  assemblyOperationCost: numeric("assembly_operation_cost", {
    precision: 20,
    scale: 8,
  })
    .notNull()
    .default("0"),
  overheadCost: numeric("overhead_cost", { precision: 20, scale: 8 })
    .notNull()
    .default("0"),
  rejectionPercent: numeric("rejection_percent", {
    precision: 12,
    scale: 8,
  })
    .notNull()
    .default("0"),
  burningLossPercent: numeric("burning_loss_percent", {
    precision: 12,
    scale: 8,
  })
    .notNull()
    .default("0"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  createdByUserId: uuid("created_by_user_id"),
  updatedByUserId: uuid("updated_by_user_id"),
  rowVersion: bigint("row_version", { mode: "number" }).notNull().default(1),
  sourceSystem: text("source_system").notNull(),
  sourceTable: text("source_table").notNull(),
  sourceId: text("source_id").notNull(),
  sourcePayload: jsonb("source_payload"),
})

export type Item = typeof items.$inferSelect
