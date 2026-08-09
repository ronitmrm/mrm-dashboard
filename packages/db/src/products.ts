import { and, asc, eq, getTableColumns, inArray, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { randomUUID } from "node:crypto"

import {
  commercialSelectorLimit,
  exactPageResult,
  selectorResult,
  selectorSearchTerm,
} from "./commercial-bounds"
import { repositoryPool, type RepositoryPoolOptions } from "./postgres-runtime"
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

type ProductRepositoryOptions = RepositoryPoolOptions

type ProductSelectorOptions = {
  itemTypes?: string[]
}

const decimal = (value = 0) => value.toString()

export function createProductRepository(options: ProductRepositoryOptions) {
  const { close, pool } = repositoryPool(options)
  const database = drizzle(pool)

  return {
    close,

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
        .orderBy(asc(items.uid), asc(items.id))
    },

    async listForOrganization(organizationCode: string) {
      return database
        .select(getTableColumns(items))
        .from(items)
        .innerJoin(organizations, eq(items.organizationId, organizations.id))
        .where(
          sql`lower(${organizations.code}) = lower(${organizationCode.trim()})`
        )
        .orderBy(asc(items.uid), asc(items.id))
    },

    async listPageForOrganization(
      organizationCode: string,
      options: { limit: number; offset: number }
    ) {
      const limit = Math.min(Math.max(Math.trunc(options.limit), 1), 200)
      const offset = Math.max(Math.trunc(options.offset), 0)

      const rows = await database
        .select({
          ...getTableColumns(items),
          totalCount: sql<number>`cast(count(*) over() as integer)`,
        })
        .from(items)
        .innerJoin(organizations, eq(items.organizationId, organizations.id))
        .where(
          sql`lower(${organizations.code}) = lower(${organizationCode.trim()})`
        )
        .orderBy(asc(items.uid), asc(items.id))
        .limit(limit)
        .offset(offset)

      return exactPageResult(rows, { limit, offset })
    },

    async searchForOrganization(
      organizationCode: string,
      value: string,
      options: ProductSelectorOptions = {}
    ) {
      const { containsPattern, query } = selectorSearchTerm(value)
      const itemTypes = options.itemTypes
        ?.map((itemType) => itemType.trim())
        .filter(Boolean)
      const organization = sql`lower(${organizations.code}) = lower(${organizationCode.trim()})`
      const search = query
        ? containsPattern
          ? sql`lower(coalesce(${items.uid}, '') || ' ' || coalesce(${items.description}, '')) like ${containsPattern}`
          : sql`lower(${items.uid}) = ${query}`
        : undefined
      const order = query
        ? [
            sql`case when lower(${items.uid}) = ${query} then 0 else 1 end`,
            asc(items.uid),
            asc(items.id),
          ]
        : [asc(items.uid), asc(items.id)]
      const rows = await database
        .select({
          description: items.description,
          id: items.id,
          itemType: items.itemType,
          uid: items.uid,
        })
        .from(items)
        .innerJoin(organizations, eq(items.organizationId, organizations.id))
        .where(
          and(
            organization,
            search,
            itemTypes?.length ? inArray(items.itemType, itemTypes) : undefined
          )
        )
        .orderBy(...order)
        .limit(commercialSelectorLimit + 1)

      return selectorResult(rows)
    },

    async listBomLines(organizationCode: string) {
      const result = await pool.query<{
        component_description: string
        component_item_id: string
        component_uid: string
        id: string
        notes: string | null
        parent_description: string
        parent_item_id: string
        parent_uid: string
        quantity: string
      }>(
        `
          SELECT bom.id, bom.parent_item_id, bom.component_item_id,
            bom.quantity::text, bom.notes, parent.uid AS parent_uid,
            parent.description AS parent_description,
            component.uid AS component_uid,
            component.description AS component_description
          FROM catalog.bom_lines bom
          JOIN catalog.items parent ON parent.id = bom.parent_item_id
          JOIN catalog.items component ON component.id = bom.component_item_id
          JOIN core.organizations organization
            ON organization.id = bom.organization_id
          WHERE lower(organization.code) = lower($1)
          ORDER BY parent.uid, bom.created_at, bom.id
        `,
        [organizationCode.trim()]
      )
      return result.rows.map((row) => ({
        componentDescription: row.component_description,
        componentItemId: row.component_item_id,
        componentUid: row.component_uid,
        id: row.id,
        notes: row.notes,
        parentDescription: row.parent_description,
        parentItemId: row.parent_item_id,
        parentUid: row.parent_uid,
        quantity: Number(row.quantity),
      }))
    },

    async addBomLine(input: {
      actorUserId?: string | null
      componentItemId: string
      notes?: string | null
      parentItemId: string
      quantity: number
    }) {
      if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
        throw new Error("BOM quantity must be greater than zero.")
      }
      const result = await pool.query<{ id: string }>(
        `
          WITH created AS (
            INSERT INTO catalog.bom_lines (
              organization_id, parent_item_id, component_item_id, quantity,
              notes, created_by_user_id, source_system, source_table, source_id
            )
            SELECT parent.organization_id, parent.id, component.id, $3, $4, $5,
              'mrm-dashboard', 'bom_lines', $6
            FROM catalog.items parent
            JOIN catalog.items component
              ON component.id = $2
              AND component.organization_id = parent.organization_id
            WHERE parent.id = $1
              AND parent.item_type IN ('Package', 'Assembly')
              AND parent.id <> component.id
              AND NOT EXISTS (
                WITH RECURSIVE descendants AS (
                  SELECT line.component_item_id
                  FROM catalog.bom_lines line
                  WHERE line.parent_item_id = component.id
                  UNION
                  SELECT line.component_item_id
                  FROM catalog.bom_lines line
                  JOIN descendants descendant
                    ON line.parent_item_id = descendant.component_item_id
                )
                SELECT 1 FROM descendants
                WHERE component_item_id = parent.id
              )
            RETURNING id, organization_id
          ),
          audited AS (
            INSERT INTO core.audit_events (
              organization_id, actor_user_id, event_type, target_table,
              target_id, metadata
            )
            SELECT organization_id, $5, 'bom_line.created', 'bom_lines', id,
              jsonb_build_object(
                'parentItemId', $1::text,
                'componentItemId', $2::text,
                'quantity', $3::numeric
              )
            FROM created
            RETURNING target_id
          )
          SELECT target_id AS id FROM audited
        `,
        [
          input.parentItemId,
          input.componentItemId,
          input.quantity,
          input.notes?.trim() || null,
          input.actorUserId ?? null,
          randomUUID(),
        ]
      )
      if (!result.rows[0]) {
        throw new Error(
          "Choose a Package or Assembly parent and a different component from the same organization; cyclic BOMs are not allowed."
        )
      }
      return { id: result.rows[0].id }
    },
  }
}
