import {
  bigint,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

const sales = pgSchema("sales")

export const customers = sales.table("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  customerUid: text("customer_uid").notNull(),
  companyName: text("company_name").notNull(),
  status: text("status").notNull().default("Active"),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  country: text("country"),
  defaultBuyerName: text("default_buyer_name"),
  defaultIncoterms: text("default_incoterms"),
  defaultPaymentTerms: text("default_payment_terms"),
  defaultShipmentMode: text("default_shipment_mode"),
  defaultPackagingTerms: text("default_packaging_terms"),
  defaultCurrency: text("default_currency"),
  notes: text("notes"),
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

export type Customer = typeof customers.$inferSelect
