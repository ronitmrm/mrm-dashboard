import { randomUUID } from "node:crypto"
import {
  designProductName,
  designProductTypes,
  designProductionTypes,
} from "./commercial-design-domain"
import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import { nextInternalProductUid } from "./product-uid"

export class PortfolioEntryError extends Error {}

export type PortfolioEntryInput = {
  actorUserId: string
  organizationCode: string
  uid?: string
  itemType: "List" | "Package" | "Assembly"
  productSize: string
  category: string
  subcategory: string
  productType?: string
  productionType: string
  grade?: string
  rodType?: string
  rodSize?: string
  pieceWeight: number
  blankPieceWeight: number
  dieCode?: string
  processesRequired: string[]
  remarks?: string
  components: Array<{ uid: string; quantity: number }>
}

export function createPortfolioEntryRepository(options: RepositoryPoolOptions) {
  const { pool, close } = repositoryPool(options)
  return {
    close,
    async getEntry(organizationCode: string, uid: string) {
      const result = await pool.query<{
        id: string
        uid: string
        costing_status: string
      }>(
        `
        SELECT item.id, item.uid, item.source_payload->>'portfolioCostingStatus' AS costing_status
        FROM catalog.items item JOIN core.organizations org ON org.id = item.organization_id
        WHERE lower(org.code) = lower($1) AND lower(item.uid) = lower($2)
          AND item.source_table = 'portfolio_entries' AND item.source_system = 'mrm-dashboard'
      `,
        [organizationCode, uid]
      )
      return result.rows[0] ?? null
    },
    async create(input: PortfolioEntryInput) {
      const container =
        input.itemType === "Package" || input.itemType === "Assembly"
      if (!["List", "Package", "Assembly"].includes(input.itemType))
        throw new PortfolioEntryError("Choose a valid product type.")
      if (
        ![input.productSize, input.category, input.subcategory].every((value) =>
          value.trim()
        )
      )
        throw new PortfolioEntryError(
          "Product size, category and subcategory are required."
        )
      if (
        !(designProductionTypes as readonly string[]).includes(
          input.productionType
        )
      )
        throw new PortfolioEntryError("Choose a valid production type.")
      if (
        !container &&
        input.productionType !== "DP" &&
        !(designProductTypes as readonly string[]).includes(
          input.productType ?? ""
        )
      )
        throw new PortfolioEntryError("Choose a product type.")
      if (
        !container &&
        (!Number.isFinite(input.pieceWeight) ||
          input.pieceWeight <= 0 ||
          !Number.isFinite(input.blankPieceWeight) ||
          input.blankPieceWeight < 0)
      )
        throw new PortfolioEntryError(
          "Enter a positive one-piece weight and non-negative blank weight."
        )
      if (!container && input.components.length)
        throw new PortfolioEntryError(
          "Individual parts cannot contain BOM components."
        )
      if (
        container &&
        input.components.length < (input.itemType === "Package" ? 2 : 1)
      )
        throw new PortfolioEntryError(
          "A Package needs at least two components; an Assembly needs at least one."
        )
      if (
        input.components.some(
          (row) =>
            !row.uid.trim() ||
            !Number.isFinite(row.quantity) ||
            row.quantity <= 0
        ) ||
        new Set(input.components.map((row) => row.uid.trim().toLowerCase()))
          .size !== input.components.length
      )
        throw new PortfolioEntryError(
          "Use distinct component UIDs with positive quantities."
        )
      const uid = input.uid?.trim().toUpperCase()
      if (uid && !/^M[1-9][0-9]*(?:\/[A-Z0-9]+)*$/.test(uid))
        throw new PortfolioEntryError(
          "Enter an internal UID such as M855 or M25/1, or leave it blank to generate one."
        )
      const processes = [
        ...new Set(
          input.processesRequired.map((value) => value.trim()).filter(Boolean)
        ),
      ]
      const allowedProcesses = [
        "Machining",
        "Package Assembly",
        "Washing",
        "Checking",
        "Marking",
        "Plating",
        "Annealing",
        "Deburring",
        "Buffing",
        "Sealant",
      ]
      if (processes.some((value) => !allowedProcesses.includes(value)))
        throw new PortfolioEntryError("Choose valid required processes.")
      try {
        return await withTransaction(pool, async (client) => {
          const organization = await client.query<{ id: string }>(
            "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
            [input.organizationCode]
          )
          const organizationId = organization.rows[0]?.id
          if (!organizationId)
            throw new PortfolioEntryError("Organization was not found.")
          // Manual and generated UIDs share the order-conversion allocator's lock.
          const generatedUid = await nextInternalProductUid(
            client,
            organizationId
          )
          const productUid = uid || generatedUid
          const duplicate = await client.query(
            "SELECT id FROM catalog.items WHERE organization_id = $1 AND lower(uid) = lower($2)",
            [organizationId, productUid]
          )
          if (duplicate.rows.length)
            throw new PortfolioEntryError(
              "This UID already exists in Portfolio. Open that product instead of creating a duplicate."
            )
          const masters = await client.query<{
            valid: boolean
            grade_id: string | null
            rod_type_id: string | null
            machine_type_id: string | null
            rod_size_valid: boolean
          }>(
            `
            SELECT EXISTS (
              SELECT 1 FROM catalog.item_categories category
              JOIN catalog.item_subcategories subcategory ON subcategory.category_id = category.id AND subcategory.organization_id = category.organization_id
              WHERE category.organization_id = $1 AND category.name = $2 AND subcategory.name = $3
            ) AS valid,
            (SELECT id FROM catalog.material_grades WHERE organization_id = $1 AND name = $4 LIMIT 1) AS grade_id,
            (SELECT id FROM catalog.rod_types WHERE organization_id = $1 AND name = $5 LIMIT 1) AS rod_type_id,
            (SELECT id FROM catalog.machine_types WHERE organization_id = $1 AND name = $6 LIMIT 1) AS machine_type_id,
            EXISTS (SELECT 1 FROM catalog.rod_sizes WHERE organization_id = $1 AND name = $7) AS rod_size_valid
          `,
            [
              organizationId,
              input.category,
              input.subcategory,
              input.grade ?? "",
              input.rodType ?? "",
              input.productionType,
              input.rodSize ?? "",
            ]
          )
          const master = masters.rows[0]
          if (
            !master?.valid ||
            !master.machine_type_id ||
            (!container &&
              input.productionType !== "DP" &&
              (!master.grade_id ||
                !master.rod_type_id ||
                !master.rod_size_valid))
          )
            throw new PortfolioEntryError(
              "Choose valid classification, production and material master values."
            )
          const components: Array<{
            id: string
            uid: string
            quantity: number
            weight: number
          }> = []
          for (const row of input.components) {
            const component = await client.query<{
              id: string
              uid: string
              weight_100_pcs: string
            }>(
              `
              SELECT id, uid, weight_100_pcs::text FROM catalog.items
              WHERE organization_id = $1 AND lower(uid) = lower($2) AND uid_kind = 'INTERNAL' AND lifecycle_status = 'P'
              FOR SHARE
            `,
              [organizationId, row.uid.trim()]
            )
            const saved = component.rows[0]
            if (!saved || Number(saved.weight_100_pcs) <= 0)
              throw new PortfolioEntryError(
                `Component ${row.uid} must be an existing Portfolio product with a positive weight.`
              )
            components.push({
              id: saved.id,
              uid: saved.uid,
              quantity: row.quantity,
              weight: Number(saved.weight_100_pcs),
            })
          }
          const weight = container
            ? components.reduce(
                (total, row) => total + row.quantity * row.weight,
                0
              )
            : input.pieceWeight
          if (!Number.isFinite(weight) || weight <= 0) throw new PortfolioEntryError("The product must have a positive, finite one-piece weight.")
          const id = randomUUID()
          const payload = {
            portfolioEntry: true,
            portfolioCostingStatus: "Not Started",
            productSize: input.productSize.trim(),
            category: input.category,
            subcategory: input.subcategory,
            productType: container ? null : input.productType,
            productionType: input.productionType,
            processesRequired: processes,
          }
          const description = designProductName({
            size: input.productSize,
            category: input.category,
            subcategory: input.subcategory,
          })
          await client.query(
            `
            INSERT INTO catalog.items (id, organization_id, uid, uid_kind, lifecycle_status, description, item_type, production_type,
              material_grade_id, rod_type_id, rod_size, machine_type_id, weight_100_pcs, pieces_per_kg, casting, die_code, remarks,
              pricing_method, source_system, source_table, source_id, source_payload, created_by_user_id, updated_by_user_id)
            VALUES ($1,$2,$3,'INTERNAL','P',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'mrm-dashboard','portfolio_entries',$1::text,$17,$18,$18)
          `,
            [
              id,
              organizationId,
              productUid,
              description,
              input.itemType,
              container ? null : (input.productType ?? null),
              container ? null : master.grade_id,
              container ? null : master.rod_type_id,
              container ? null : (input.rodSize ?? null),
              master.machine_type_id,
              weight,
              1000 / weight,
              container ? 0 : input.blankPieceWeight,
              input.dieCode?.trim() || null,
              input.remarks?.trim() || null,
              input.productionType === "DP" ? "Direct Purchase" : "Derived",
              JSON.stringify(payload),
              input.actorUserId,
            ]
          )
          for (const [index, component] of components.entries())
            await client.query(
              `
            INSERT INTO catalog.bom_lines (organization_id,parent_item_id,component_item_id,quantity,source_system,source_table,source_id,created_by_user_id,sequence)
            VALUES ($1,$2,$3,$4,'mrm-dashboard','portfolio_entries',$5,$6,$7)
          `,
              [
                organizationId,
                id,
                component.id,
                component.quantity,
                randomUUID(),
                input.actorUserId,
                index + 1,
              ]
            )
          await client.query(
            `
            INSERT INTO core.audit_events (organization_id,actor_user_id,event_type,target_table,target_id,metadata)
            VALUES ($1,$2,'product.portfolio_registered','items',$3,$4)
          `,
            [
              organizationId,
              input.actorUserId,
              id,
              JSON.stringify({
                uid: productUid,
                components,
                source: "Direct Portfolio Entry",
              }),
            ]
          )
          return { id, uid: productUid }
        })
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "23505"
        )
          throw new PortfolioEntryError("This UID already exists in Portfolio.")
        throw error
      }
    },
  }
}
