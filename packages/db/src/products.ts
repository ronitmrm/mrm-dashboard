import { asc, eq, getTableColumns, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { items } from "./schema/products"
import { organizations } from "./schema/organizations"

type ProductSource = {
  id: string
  payload?: Record<string, unknown>
  system: string
  table: string
}

type CreateProduct = {
  alloyPremium?: number
  annealing?: number
  assemblyOperationCost?: number
  buffing?: number
  burningLossPercent?: number
  casting?: number
  checking?: number
  deburring?: number
  description: string
  dieCode?: string | null
  directPurchasePricePerKg?: number
  directPurchasePricePerPiece?: number
  extrusionCost?: number
  forgingCost?: number
  itemType?: string
  lifecycleStatus?: string
  machineTypeId?: string | null
  machiningCost?: number
  marking?: number
  materialGradeId?: string | null
  organizationId: string
  overheadCost?: number
  plating?: number
  pricingMethod?: string
  productionType?: string | null
  productCostInr?: number
  rejectionPercent?: number
  remarks?: string | null
  rodSize?: string | null
  rodTypeId?: string | null
  sealant?: number
  source: ProductSource
  uid: string
  uidKind?: string
  washing?: number
  weight100Pcs?: number
}

type ProductRepositoryOptions = {
  connectionString: string
}

const decimal = (value = 0) => value.toString()

export function createProductRepository({
  connectionString,
}: ProductRepositoryOptions) {
  const pool = new Pool({ connectionString })
  const database = drizzle(pool)

  return {
    close: () => pool.end(),

    async create(input: CreateProduct) {
      const uid = input.uid.trim()
      const description = input.description.trim()
      if (!uid) {
        throw new Error("Product UID is required.")
      }
      if (!description) {
        throw new Error("Product description is required.")
      }

      const weight100Pcs = input.weight100Pcs ?? 0
      const piecesPerKg = weight100Pcs > 0 ? 1000 / weight100Pcs : 0
      const machiningCost = input.machiningCost ?? 0
      const machiningPricePerPiece =
        piecesPerKg > 0 ? machiningCost / piecesPerKg : 0
      const isPackage = input.itemType === "Package"
      const isBarstock =
        input.productionType?.trim().toLowerCase() === "barstock"

      const [created] = await database
        .insert(items)
        .values({
          alloyPremium: decimal(input.alloyPremium),
          annealing: decimal(input.annealing),
          assemblyOperationCost: decimal(
            isPackage ? input.assemblyOperationCost : 0
          ),
          buffing: decimal(input.buffing),
          burningLossPercent: decimal(input.burningLossPercent),
          casting: decimal(input.casting ?? 1),
          checking: decimal(input.checking),
          deburring: decimal(input.deburring),
          description,
          dieCode: input.dieCode ?? null,
          directPurchasePricePerKg: decimal(input.directPurchasePricePerKg),
          directPurchasePricePerPiece: decimal(
            input.directPurchasePricePerPiece
          ),
          extrusionCost: decimal(input.extrusionCost),
          forgingCost: decimal(isBarstock ? 0 : input.forgingCost),
          itemType: input.itemType ?? "List",
          lifecycleStatus: input.lifecycleStatus ?? "P",
          machineTypeId: input.machineTypeId ?? null,
          machiningCost: decimal(machiningCost),
          machiningPricePerPiece: decimal(machiningPricePerPiece),
          marking: decimal(input.marking),
          materialGradeId: input.materialGradeId ?? null,
          organizationId: input.organizationId,
          overheadCost: decimal(isPackage ? 0 : input.overheadCost),
          piecesPerKg: decimal(piecesPerKg),
          plating: decimal(input.plating),
          pricingMethod: input.pricingMethod ?? "Derived",
          productionType: input.productionType ?? null,
          productCostInr: decimal(input.productCostInr),
          rejectionPercent: decimal(input.rejectionPercent),
          remarks: input.remarks ?? null,
          rodSize: input.rodSize ?? null,
          rodTypeId: input.rodTypeId ?? null,
          sealant: decimal(input.sealant),
          sourceId: input.source.id,
          sourcePayload: input.source.payload ?? null,
          sourceSystem: input.source.system,
          sourceTable: input.source.table,
          uid,
          uidKind: input.uidKind ?? "INTERNAL",
          washing: decimal(input.washing),
          weight100Pcs: decimal(weight100Pcs),
        })
        .returning()

      if (!created) {
        throw new Error("Product was not created.")
      }

      return created
    },

    async list(organizationId: string) {
      return database
        .select()
        .from(items)
        .where(eq(items.organizationId, organizationId))
        .orderBy(asc(items.uid))
    },

    async listForOrganization(organizationCode: string) {
      return database
        .select(getTableColumns(items))
        .from(items)
        .innerJoin(organizations, eq(items.organizationId, organizations.id))
        .where(
          sql`lower(${organizations.code}) = lower(${organizationCode.trim()})`
        )
        .orderBy(asc(items.uid))
    },
  }
}
