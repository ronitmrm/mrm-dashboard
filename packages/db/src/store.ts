import type { PoolClient } from "pg"

import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"

export type StoreTrackingMode = "CONSUMABLE" | "SERIALIZED"
export type StoreAssetType = "CONSUMABLE" | "NON_CONSUMABLE"
export type StoreHolderType =
  | "DEPARTMENT"
  | "MACHINE"
  | "PERSON"
  | "STORE"
  | "UNIT"
  | "VENDOR"

type StoreRequisitionBatchInput = {
  actorUserId?: string | null
  department: string
  items: Array<{ itemTypeId: string; quantity: number }>
  locationId: string
  organizationId: string
  purpose?: string | null
  requestedBy: string
  requiredOn?: string | null
}

function requiredText(value: unknown, label: string) {
  const text = String(value ?? "").trim()
  if (!text) throw new Error(`${label} is required.`)
  return text
}

function positiveQuantity(value: number, label = "Quantity") {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than zero.`)
  }
  return value
}

function storeAssetType(value: unknown): StoreAssetType {
  if (value === "CONSUMABLE" || value === "NON_CONSUMABLE") return value
  throw new Error("Asset type must be Consumable or Non Consumable.")
}

function trackingModeForAssetType(
  assetType: StoreAssetType
): StoreTrackingMode {
  return assetType === "NON_CONSUMABLE" ? "SERIALIZED" : "CONSUMABLE"
}

async function nextDocumentNumber(
  client: PoolClient,
  input: {
    counterKey: string
    organizationId: string
    prefix: string
  }
) {
  const yearResult = await client.query<{ year: number }>(
    "SELECT extract(year FROM current_date)::integer AS year"
  )
  const year = yearResult.rows[0]!.year
  const counter = await client.query<{ current_value: number }>(
    `
      INSERT INTO store.number_counters (
        organization_id, counter_key, counter_year, current_value
      ) VALUES ($1, $2, $3, 1)
      ON CONFLICT (organization_id, counter_key, counter_year)
      DO UPDATE SET current_value = store.number_counters.current_value + 1
      RETURNING current_value
    `,
    [input.organizationId, input.counterKey, year]
  )
  return `${input.prefix}-${year}-${String(counter.rows[0]!.current_value).padStart(6, "0")}`
}

async function nextStoreTypeCode(client: PoolClient, organizationId: string) {
  const counter = await client.query<{ current_value: number }>(
    `
      INSERT INTO store.number_counters (
        organization_id, counter_key, counter_year, current_value
      ) VALUES ($1, 'TYPE_CODE', 0, 1)
      ON CONFLICT (organization_id, counter_key, counter_year)
      DO UPDATE SET current_value = store.number_counters.current_value + 1
      RETURNING current_value
    `,
    [organizationId]
  )
  return `ST${String(counter.rows[0]!.current_value).padStart(3, "0")}`
}

async function assetClassificationPath(
  client: PoolClient,
  input: {
    assetCategoryId: string
    assetNameId: string
    assetSubcategoryId: string
    organizationId: string
  }
) {
  const result = await client.query<{
    asset_category: string
    asset_name: string
    asset_subcategory: string
  }>(
    `
      SELECT category.name AS asset_category,
        subcategory.name AS asset_subcategory,
        asset_name.name AS asset_name
      FROM store.asset_categories category
      JOIN store.asset_subcategories subcategory
        ON subcategory.category_id = category.id
      JOIN store.asset_names asset_name
        ON asset_name.subcategory_id = subcategory.id
      WHERE category.organization_id = $1
        AND subcategory.organization_id = $1
        AND asset_name.organization_id = $1
        AND category.id = $2
        AND subcategory.id = $3
        AND asset_name.id = $4
        AND category.active AND subcategory.active AND asset_name.active
    `,
    [
      input.organizationId,
      input.assetCategoryId,
      input.assetSubcategoryId,
      input.assetNameId,
    ]
  )
  if (!result.rows[0]) {
    throw new Error(
      "Select a valid Store Category, Subcategory, and Asset Name combination."
    )
  }
  return result.rows[0]
}

async function machineIdForReference(
  client: PoolClient,
  organizationId: string,
  machineNumber: string | null | undefined
) {
  if (!machineNumber?.trim()) return null
  const result = await client.query<{ id: string }>(
    `
      SELECT id FROM catalog.machines
      WHERE organization_id = $1 AND lower(machine_number) = lower($2)
    `,
    [organizationId, machineNumber.trim()]
  )
  if (!result.rows[0])
    throw new Error("Machine was not found in Machine Master.")
  return result.rows[0].id
}

export function createStoreRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)

  const createRequisitionBatch = async (input: StoreRequisitionBatchInput) =>
    withTransaction(pool, async (client) => {
      if (!input.items.length) {
        throw new Error("Select at least one coded Store item.")
      }
      const itemTypeIds = input.items.map(({ itemTypeId }) => itemTypeId)
      if (new Set(itemTypeIds).size !== itemTypeIds.length) {
        throw new Error(
          "Each coded Store item can appear only once per request."
        )
      }
      const department = requiredText(input.department, "Department")
      const requestedBy = requiredText(input.requestedBy, "Requested by")
      const location = await client.query<{ id: string }>(
        `
          SELECT id FROM store.locations
          WHERE id = $1 AND organization_id = $2
            AND location_type = 'STORE' AND active
        `,
        [input.locationId, input.organizationId]
      )
      if (!location.rows[0]) {
        throw new Error("Select an active Store location.")
      }
      const itemTypes = await client.query<{ id: string }>(
        `
          SELECT id FROM store.item_types
          WHERE organization_id = $1 AND active AND id = ANY($2::uuid[])
        `,
        [input.organizationId, itemTypeIds]
      )
      if (itemTypes.rowCount !== itemTypeIds.length) {
        throw new Error("One or more selected Store items are unavailable.")
      }
      const requestNumber = await nextDocumentNumber(client, {
        counterKey: "REQUISITION",
        organizationId: input.organizationId,
        prefix: "STR-REQ",
      })
      const header = await client.query<{ id: string }>(
        `
          INSERT INTO store.requisition_headers (
            organization_id, request_number, location_id, department,
            requested_by, required_on, purpose,
            created_by_user_id, updated_by_user_id
          ) VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::date, $7, $8, $8)
          RETURNING id
        `,
        [
          input.organizationId,
          requestNumber,
          input.locationId,
          department,
          requestedBy,
          input.requiredOn ?? null,
          input.purpose?.trim() || null,
          input.actorUserId ?? null,
        ]
      )
      const lineIds: string[] = []
      for (const [index, item] of input.items.entries()) {
        const lineNumber = `${requestNumber}-${String(index + 1).padStart(2, "0")}`
        const line = await client.query<{ id: string }>(
          `
            INSERT INTO store.requisitions (
              organization_id, request_header_id, request_number,
              item_type_id, location_id, department, requested_by,
              requested_quantity, required_on, purpose,
              created_by_user_id, updated_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
              NULLIF($9, '')::date, $10, $11, $11)
            RETURNING id
          `,
          [
            input.organizationId,
            header.rows[0]!.id,
            lineNumber,
            item.itemTypeId,
            input.locationId,
            department,
            requestedBy,
            positiveQuantity(item.quantity),
            input.requiredOn ?? null,
            input.purpose?.trim() || null,
            input.actorUserId ?? null,
          ]
        )
        lineIds.push(line.rows[0]!.id)
      }
      return { id: header.rows[0]!.id, lineIds, requestNumber }
    })

  return {
    close,

    async organizationIdForCode(code: string) {
      const result = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
        [requiredText(code, "Organization code")]
      )
      if (!result.rows[0]) throw new Error("Organization was not found.")
      return result.rows[0].id
    },

    async createLocation(input: {
      actorUserId?: string | null
      code: string
      locationType?: "DEPARTMENT" | "STORE" | "UNIT"
      name: string
      organizationId: string
    }) {
      const result = await pool.query<{ id: string }>(
        `
          INSERT INTO store.locations (
            organization_id, code, name, location_type,
            created_by_user_id, updated_by_user_id
          ) VALUES ($1, $2, $3, $4, $5, $5)
          ON CONFLICT (organization_id, lower(code))
          DO UPDATE SET name = EXCLUDED.name,
            location_type = EXCLUDED.location_type,
            active = true, updated_at = now(),
            updated_by_user_id = EXCLUDED.updated_by_user_id
          RETURNING id
        `,
        [
          input.organizationId,
          requiredText(input.code, "Location code"),
          requiredText(input.name, "Location name"),
          input.locationType ?? "STORE",
          input.actorUserId ?? null,
        ]
      )
      return result.rows[0]!
    },

    async updateLocation(input: {
      actorUserId?: string | null
      id: string
      locationType?: "DEPARTMENT" | "STORE" | "UNIT"
      name: string
      organizationId: string
    }) {
      const result = await pool.query<{ id: string }>(
        `UPDATE store.locations
         SET name = $1, location_type = $2, updated_by_user_id = $3,
           updated_at = now()
         WHERE id = $4 AND organization_id = $5
         RETURNING id`,
        [
          requiredText(input.name, "Location name"),
          input.locationType ?? "STORE",
          input.actorUserId ?? null,
          input.id,
          input.organizationId,
        ]
      )
      if (!result.rows[0]) throw new Error("Store Location was not found.")
      return result.rows[0]
    },

    async listLocations(organizationId: string) {
      const result = await pool.query<{
        code: string
        id: string
        locationType: string
        name: string
      }>(
        `
          SELECT id, code, name, location_type AS "locationType"
          FROM store.locations
          WHERE organization_id = $1 AND active
          ORDER BY name
        `,
        [organizationId]
      )
      return result.rows
    },

    async createAssetCategory(input: {
      actorUserId?: string | null
      name: string
      organizationId: string
    }) {
      const result = await pool.query<{ id: string }>(
        `
          INSERT INTO store.asset_categories (
            organization_id, name, created_by_user_id, updated_by_user_id
          ) VALUES ($1, $2, $3, $3)
          ON CONFLICT (organization_id, lower(name))
          DO UPDATE SET active = true, updated_at = now(),
            updated_by_user_id = EXCLUDED.updated_by_user_id
          RETURNING id
        `,
        [
          input.organizationId,
          requiredText(input.name, "Asset category"),
          input.actorUserId ?? null,
        ]
      )
      return result.rows[0]!
    },

    async updateAssetCategory(input: {
      actorUserId?: string | null
      id: string
      name: string
      organizationId: string
    }) {
      return withTransaction(pool, async (client) => {
        const name = requiredText(input.name, "Asset category")
        const result = await client.query<{ id: string }>(
          `UPDATE store.asset_categories
           SET name = $1, updated_by_user_id = $2, updated_at = now()
           WHERE id = $3 AND organization_id = $4
           RETURNING id`,
          [name, input.actorUserId ?? null, input.id, input.organizationId]
        )
        if (!result.rows[0]) throw new Error("Store Category was not found.")
        await client.query(
          `UPDATE store.item_types SET asset_category = $1, updated_at = now()
           WHERE organization_id = $2 AND asset_category_id = $3`,
          [name, input.organizationId, input.id]
        )
        return result.rows[0]
      })
    },

    async createAssetSubcategory(input: {
      actorUserId?: string | null
      categoryId: string
      name: string
      organizationId: string
    }) {
      const result = await pool.query<{ id: string }>(
        `
          INSERT INTO store.asset_subcategories (
            organization_id, category_id, name,
            created_by_user_id, updated_by_user_id
          )
          SELECT $1, category.id, $2, $3, $3
          FROM store.asset_categories category
          WHERE category.id = $4 AND category.organization_id = $1
            AND category.active
          ON CONFLICT (organization_id, category_id, lower(name))
          DO UPDATE SET active = true, updated_at = now(),
            updated_by_user_id = EXCLUDED.updated_by_user_id
          RETURNING id
        `,
        [
          input.organizationId,
          requiredText(input.name, "Asset subcategory"),
          input.actorUserId ?? null,
          input.categoryId,
        ]
      )
      if (!result.rows[0]) throw new Error("Store Category was not found.")
      return result.rows[0]
    },

    async updateAssetSubcategory(input: {
      actorUserId?: string | null
      categoryId: string
      id: string
      name: string
      organizationId: string
    }) {
      return withTransaction(pool, async (client) => {
        const result = await client.query<{ id: string }>(
          `UPDATE store.asset_subcategories subcategory
         SET category_id = category.id, name = $1, updated_by_user_id = $2,
           updated_at = now()
         FROM store.asset_categories category
         WHERE subcategory.id = $3
           AND subcategory.organization_id = $4
           AND category.id = $5 AND category.organization_id = $4
           AND category.active
         RETURNING subcategory.id`,
          [
            requiredText(input.name, "Asset subcategory"),
            input.actorUserId ?? null,
            input.id,
            input.organizationId,
            input.categoryId,
          ]
        )
        if (!result.rows[0]) throw new Error("Store Subcategory was not found.")
        await client.query(
          `UPDATE store.item_types SET asset_subcategory = $1,
           asset_category_id = $2,
           asset_category = (SELECT name FROM store.asset_categories WHERE id = $2),
           updated_at = now()
         WHERE organization_id = $3 AND asset_subcategory_id = $4`,
          [
            requiredText(input.name, "Asset subcategory"),
            input.categoryId,
            input.organizationId,
            input.id,
          ]
        )
        return result.rows[0]
      })
    },

    async createAssetName(input: {
      actorUserId?: string | null
      name: string
      organizationId: string
      subcategoryId: string
    }) {
      const result = await pool.query<{ id: string }>(
        `
          INSERT INTO store.asset_names (
            organization_id, subcategory_id, name,
            created_by_user_id, updated_by_user_id
          )
          SELECT $1, subcategory.id, $2, $3, $3
          FROM store.asset_subcategories subcategory
          WHERE subcategory.id = $4 AND subcategory.organization_id = $1
            AND subcategory.active
          ON CONFLICT (organization_id, subcategory_id, lower(name))
          DO UPDATE SET active = true, updated_at = now(),
            updated_by_user_id = EXCLUDED.updated_by_user_id
          RETURNING id
        `,
        [
          input.organizationId,
          requiredText(input.name, "Asset name"),
          input.actorUserId ?? null,
          input.subcategoryId,
        ]
      )
      if (!result.rows[0]) throw new Error("Store Subcategory was not found.")
      return result.rows[0]
    },

    async updateAssetName(input: {
      actorUserId?: string | null
      id: string
      name: string
      organizationId: string
      subcategoryId: string
    }) {
      return withTransaction(pool, async (client) => {
        const result = await client.query<{ id: string }>(
          `UPDATE store.asset_names asset_name
         SET subcategory_id = subcategory.id, name = $1,
           updated_by_user_id = $2, updated_at = now()
         FROM store.asset_subcategories subcategory
         WHERE asset_name.id = $3
           AND asset_name.organization_id = $4
           AND subcategory.id = $5 AND subcategory.organization_id = $4
           AND subcategory.active
         RETURNING asset_name.id`,
          [
            requiredText(input.name, "Asset name"),
            input.actorUserId ?? null,
            input.id,
            input.organizationId,
            input.subcategoryId,
          ]
        )
        if (!result.rows[0]) throw new Error("Store Asset Name was not found.")
        await client.query(
          `UPDATE store.item_types item
         SET asset_name = $1, asset_subcategory_id = subcategory.id,
           asset_subcategory = subcategory.name,
           asset_category_id = category.id, asset_category = category.name,
           updated_at = now()
         FROM store.asset_subcategories subcategory
         JOIN store.asset_categories category ON category.id = subcategory.category_id
         WHERE item.organization_id = $2 AND item.asset_name_id = $3
           AND subcategory.id = $4`,
          [
            requiredText(input.name, "Asset name"),
            input.organizationId,
            input.id,
            input.subcategoryId,
          ]
        )
        return result.rows[0]
      })
    },

    async listAssetClassificationMasters(organizationId: string) {
      const [categories, subcategories, assetNames] = await Promise.all([
        pool.query<{ id: string; name: string }>(
          `SELECT id, name FROM store.asset_categories
           WHERE organization_id = $1 AND active ORDER BY name`,
          [organizationId]
        ),
        pool.query<{
          categoryId: string
          categoryName: string
          id: string
          name: string
        }>(
          `SELECT subcategory.id, subcategory.category_id AS "categoryId",
             category.name AS "categoryName", subcategory.name
           FROM store.asset_subcategories subcategory
           JOIN store.asset_categories category ON category.id = subcategory.category_id
           WHERE subcategory.organization_id = $1 AND subcategory.active
             AND category.active
           ORDER BY category.name, subcategory.name`,
          [organizationId]
        ),
        pool.query<{
          categoryId: string
          categoryName: string
          id: string
          name: string
          subcategoryId: string
          subcategoryName: string
        }>(
          `SELECT asset_name.id, asset_name.subcategory_id AS "subcategoryId",
             subcategory.category_id AS "categoryId",
             category.name AS "categoryName",
             subcategory.name AS "subcategoryName", asset_name.name
           FROM store.asset_names asset_name
           JOIN store.asset_subcategories subcategory
             ON subcategory.id = asset_name.subcategory_id
           JOIN store.asset_categories category ON category.id = subcategory.category_id
           WHERE asset_name.organization_id = $1 AND asset_name.active
             AND subcategory.active AND category.active
           ORDER BY category.name, subcategory.name, asset_name.name`,
          [organizationId]
        ),
      ])
      return {
        assetNames: assetNames.rows,
        categories: categories.rows,
        subcategories: subcategories.rows,
      }
    },

    async createSupplier(input: {
      actorUserId?: string | null
      code: string
      contactDetails?: string | null
      email?: string | null
      name: string
      organizationId: string
    }) {
      const result = await pool.query<{ id: string }>(
        `
          INSERT INTO store.suppliers (
            organization_id, code, name, contact_details, email,
            created_by_user_id, updated_by_user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $6)
          ON CONFLICT (organization_id, lower(code))
          DO UPDATE SET name = EXCLUDED.name,
            contact_details = EXCLUDED.contact_details,
            email = EXCLUDED.email,
            active = true, updated_at = now(),
            updated_by_user_id = EXCLUDED.updated_by_user_id
          RETURNING id
        `,
        [
          input.organizationId,
          requiredText(input.code, "Supplier code"),
          requiredText(input.name, "Supplier name"),
          input.contactDetails?.trim() || null,
          input.email?.trim().toLocaleLowerCase() || null,
          input.actorUserId ?? null,
        ]
      )
      return result.rows[0]!
    },

    async updateSupplier(input: {
      actorUserId?: string | null
      contactDetails?: string | null
      email?: string | null
      id: string
      name: string
      organizationId: string
    }) {
      const result = await pool.query<{ id: string }>(
        `UPDATE store.suppliers
         SET name = $1, contact_details = $2, email = $3,
           updated_by_user_id = $4, updated_at = now()
         WHERE id = $5 AND organization_id = $6
         RETURNING id`,
        [
          requiredText(input.name, "Supplier name"),
          input.contactDetails?.trim() || null,
          input.email?.trim().toLocaleLowerCase() || null,
          input.actorUserId ?? null,
          input.id,
          input.organizationId,
        ]
      )
      if (!result.rows[0]) throw new Error("Store Supplier was not found.")
      return result.rows[0]
    },

    async listSuppliers(organizationId: string) {
      const result = await pool.query<{
        code: string
        contactDetails: string | null
        email: string | null
        id: string
        name: string
      }>(
        `
          SELECT id, code, name, contact_details AS "contactDetails", email
          FROM store.suppliers
          WHERE organization_id = $1 AND active
          ORDER BY name
        `,
        [organizationId]
      )
      return result.rows
    },

    async createSupplierPrice(input: {
      actorUserId?: string | null
      itemTypeId: string
      organizationId: string
      quoteReference?: string | null
      supplierId: string
      unitPrice: string
      validFrom?: string | null
    }) {
      const unitPrice = Number(input.unitPrice)
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error("Unit price must be zero or greater.")
      }
      const result = await pool.query<{ id: string }>(
        `
          INSERT INTO store.supplier_prices (
            organization_id, item_type_id, supplier_id, unit_price,
            valid_from, quote_reference, created_by_user_id
          )
          SELECT $1, item.id, supplier.id, $4,
            COALESCE(NULLIF($5, '')::date, current_date), $6, $7
          FROM store.item_types item
          JOIN store.suppliers supplier
            ON supplier.organization_id = item.organization_id
          WHERE item.organization_id = $1 AND item.id = $2
            AND supplier.id = $3 AND item.active AND supplier.active
          RETURNING id
        `,
        [
          input.organizationId,
          input.itemTypeId,
          input.supplierId,
          input.unitPrice,
          input.validFrom ?? null,
          input.quoteReference?.trim() || null,
          input.actorUserId ?? null,
        ]
      )
      if (!result.rows[0]) {
        throw new Error("Select a valid Store Item and Supplier.")
      }
      return result.rows[0]
    },

    async createVendor(input: {
      actorUserId?: string | null
      code: string
      contactDetails?: string | null
      name: string
      organizationId: string
    }) {
      const result = await pool.query<{ id: string }>(
        `
          INSERT INTO store.vendors (
            organization_id, code, name, contact_details,
            created_by_user_id, updated_by_user_id
          ) VALUES ($1, $2, $3, $4, $5, $5)
          ON CONFLICT (organization_id, lower(code))
          DO UPDATE SET name = EXCLUDED.name,
            contact_details = EXCLUDED.contact_details,
            active = true, updated_at = now(),
            updated_by_user_id = EXCLUDED.updated_by_user_id
          RETURNING id
        `,
        [
          input.organizationId,
          requiredText(input.code, "Vendor code"),
          requiredText(input.name, "Vendor name"),
          input.contactDetails?.trim() || null,
          input.actorUserId ?? null,
        ]
      )
      return result.rows[0]!
    },

    async updateVendor(input: {
      actorUserId?: string | null
      contactDetails?: string | null
      id: string
      name: string
      organizationId: string
    }) {
      const result = await pool.query<{ id: string }>(
        `UPDATE store.vendors
         SET name = $1, contact_details = $2, updated_by_user_id = $3,
           updated_at = now()
         WHERE id = $4 AND organization_id = $5
         RETURNING id`,
        [
          requiredText(input.name, "Vendor name"),
          input.contactDetails?.trim() || null,
          input.actorUserId ?? null,
          input.id,
          input.organizationId,
        ]
      )
      if (!result.rows[0]) throw new Error("Store Vendor was not found.")
      return result.rows[0]
    },

    async listVendors(organizationId: string) {
      const result = await pool.query<{
        code: string
        contactDetails: string | null
        id: string
        name: string
      }>(
        `
          SELECT id, code, name, contact_details AS "contactDetails"
          FROM store.vendors
          WHERE organization_id = $1 AND active
          ORDER BY name
        `,
        [organizationId]
      )
      return result.rows
    },

    async createPurchaseOrder(input: {
      actorUserId?: string | null
      itemTypeId: string
      orderDate?: string | null
      organizationId: string
      quantity: number
      remark?: string | null
      supplierId: string
      unitPrice: string
    }) {
      return withTransaction(pool, async (client) => {
        const quantity = positiveQuantity(input.quantity)
        const unitPrice = Number(input.unitPrice)
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          throw new Error("Unit price must be zero or greater.")
        }
        const references = await client.query(
          `
            SELECT 1
            FROM store.suppliers supplier
            JOIN store.item_types item ON item.organization_id = supplier.organization_id
            WHERE supplier.organization_id = $1 AND supplier.id = $2
              AND item.id = $3 AND supplier.active AND item.active
          `,
          [input.organizationId, input.supplierId, input.itemTypeId]
        )
        if (!references.rows[0]) {
          throw new Error("Select a valid Supplier and Store Item Type.")
        }
        const orderNumber = await nextDocumentNumber(client, {
          counterKey: "PURCHASE_ORDER",
          organizationId: input.organizationId,
          prefix: "STR-PO",
        })
        const order = await client.query<{ id: string }>(
          `
            INSERT INTO store.purchase_orders (
              organization_id, order_number, supplier_id, order_date, remark,
              created_by_user_id, updated_by_user_id
            ) VALUES ($1, $2, $3, COALESCE(NULLIF($4, '')::date, current_date),
              $5, $6, $6)
            RETURNING id
          `,
          [
            input.organizationId,
            orderNumber,
            input.supplierId,
            input.orderDate ?? null,
            input.remark?.trim() || null,
            input.actorUserId ?? null,
          ]
        )
        const line = await client.query<{ id: string }>(
          `
            INSERT INTO store.purchase_order_lines (
              organization_id, purchase_order_id, item_type_id,
              ordered_quantity, unit_price, created_by_user_id,
              updated_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $6)
            RETURNING id
          `,
          [
            input.organizationId,
            order.rows[0]!.id,
            input.itemTypeId,
            quantity,
            input.unitPrice,
            input.actorUserId ?? null,
          ]
        )
        return {
          id: line.rows[0]!.id,
          orderNumber,
          purchaseOrderId: order.rows[0]!.id,
        }
      })
    },

    async createPurchaseOrdersFromSelection(input: {
      actorUserId?: string | null
      items: Array<{ itemTypeId: string; quantity: number }>
      orderDate?: string | null
      organizationId: string
      remark?: string | null
    }) {
      return withTransaction(pool, async (client) => {
        if (!input.items.length) {
          throw new Error("Select at least one Store item to order.")
        }
        const quantities = new Map<string, number>()
        for (const item of input.items) {
          if (quantities.has(item.itemTypeId)) {
            throw new Error("Each Store item can appear only once per order.")
          }
          quantities.set(
            item.itemTypeId,
            positiveQuantity(item.quantity, "Order quantity")
          )
        }
        const orderDate = input.orderDate?.trim() || null
        const prices = await client.query<{
          item_type_id: string
          supplier_id: string
          unit_price: string
        }>(
          `
            SELECT DISTINCT ON (price.item_type_id)
              price.item_type_id, price.supplier_id, price.unit_price::text
            FROM store.supplier_prices price
            JOIN store.item_types item ON item.id = price.item_type_id
            JOIN store.suppliers supplier ON supplier.id = price.supplier_id
            WHERE price.organization_id = $1
              AND price.item_type_id = ANY($2::uuid[])
              AND price.valid_from <= COALESCE(NULLIF($3, '')::date, current_date)
              AND item.active AND supplier.active
            ORDER BY price.item_type_id, price.valid_from DESC,
              price.created_at DESC, price.id DESC
          `,
          [input.organizationId, [...quantities.keys()], orderDate]
        )
        if (prices.rows.length !== quantities.size) {
          throw new Error(
            "Every selected Store item needs a current Supplier Price Master entry."
          )
        }
        const bySupplier = new Map<string, typeof prices.rows>()
        for (const price of prices.rows) {
          const supplierLines = bySupplier.get(price.supplier_id) ?? []
          supplierLines.push(price)
          bySupplier.set(price.supplier_id, supplierLines)
        }
        const orders: Array<{
          id: string
          lineCount: number
          orderNumber: string
          supplierId: string
        }> = []
        for (const [supplierId, supplierLines] of bySupplier) {
          const orderNumber = await nextDocumentNumber(client, {
            counterKey: "PURCHASE_ORDER",
            organizationId: input.organizationId,
            prefix: "STR-PO",
          })
          const order = await client.query<{ id: string }>(
            `
              INSERT INTO store.purchase_orders (
                organization_id, order_number, supplier_id, order_date,
                remark, created_by_user_id, updated_by_user_id
              ) VALUES ($1, $2, $3,
                COALESCE(NULLIF($4, '')::date, current_date), $5, $6, $6)
              RETURNING id
            `,
            [
              input.organizationId,
              orderNumber,
              supplierId,
              orderDate,
              input.remark?.trim() || null,
              input.actorUserId ?? null,
            ]
          )
          for (const line of supplierLines) {
            await client.query(
              `
                INSERT INTO store.purchase_order_lines (
                  organization_id, purchase_order_id, item_type_id,
                  ordered_quantity, unit_price, created_by_user_id,
                  updated_by_user_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $6)
              `,
              [
                input.organizationId,
                order.rows[0]!.id,
                line.item_type_id,
                quantities.get(line.item_type_id),
                line.unit_price,
                input.actorUserId ?? null,
              ]
            )
          }
          orders.push({
            id: order.rows[0]!.id,
            lineCount: supplierLines.length,
            orderNumber,
            supplierId,
          })
        }
        return { orders }
      })
    },

    async listPurchaseOrders(organizationId: string) {
      const result = await pool.query<{
        id: string
        itemName: string
        itemTypeId: string
        orderDate: string
        orderedQuantity: string
        orderNumber: string
        orderTotal: string
        purchaseOrderId: string
        receivedQuantity: string
        remainingQuantity: string
        status: string
        supplierId: string
        supplierEmail: string | null
        supplierName: string
        typeCode: string
        unit: string
        unitPrice: string
      }>(
        `
          SELECT line.id, purchase_order.id AS "purchaseOrderId",
            purchase_order.order_number AS "orderNumber",
            purchase_order.order_date::text AS "orderDate",
            purchase_order.supplier_id AS "supplierId",
            supplier.name AS "supplierName",
            supplier.email AS "supplierEmail",
            line.item_type_id AS "itemTypeId",
            item.type_code AS "typeCode",
            item.identification_name AS "itemName", item.unit,
            trim_scale(line.ordered_quantity)::text AS "orderedQuantity",
            trim_scale(line.received_quantity)::text AS "receivedQuantity",
            trim_scale(line.ordered_quantity - line.received_quantity)::text
              AS "remainingQuantity",
            line.unit_price::text AS "unitPrice",
            trim_scale(sum(line.ordered_quantity * line.unit_price)
              OVER (PARTITION BY purchase_order.id))::text AS "orderTotal",
            purchase_order.status
          FROM store.purchase_orders purchase_order
          JOIN store.suppliers supplier ON supplier.id = purchase_order.supplier_id
          JOIN store.purchase_order_lines line
            ON line.purchase_order_id = purchase_order.id
          JOIN store.item_types item ON item.id = line.item_type_id
          WHERE purchase_order.organization_id = $1
          ORDER BY purchase_order.order_date DESC, purchase_order.created_at DESC
          LIMIT 500
        `,
        [organizationId]
      )
      return result.rows
    },

    async getPurchaseOrder(input: {
      organizationId: string
      purchaseOrderId: string
    }) {
      const order = await pool.query<{
        id: string
        orderDate: string
        orderNumber: string
        remark: string | null
        status: string
        supplierCode: string
        supplierEmail: string | null
        supplierName: string
      }>(
        `
          SELECT purchase_order.id,
            purchase_order.order_number AS "orderNumber",
            purchase_order.order_date::text AS "orderDate",
            purchase_order.status, purchase_order.remark,
            supplier.code AS "supplierCode",
            supplier.name AS "supplierName", supplier.email AS "supplierEmail"
          FROM store.purchase_orders purchase_order
          JOIN store.suppliers supplier ON supplier.id = purchase_order.supplier_id
          WHERE purchase_order.id = $1 AND purchase_order.organization_id = $2
        `,
        [input.purchaseOrderId, input.organizationId]
      )
      if (!order.rows[0]) return null
      const lines = await pool.query<{
        assetCategory: string
        assetName: string
        assetSubcategory: string
        itemName: string
        orderedQuantity: string
        receivedQuantity: string
        typeCode: string
        unit: string
        unitPrice: string
      }>(
        `
          SELECT item.type_code AS "typeCode",
            item.identification_name AS "itemName",
            item.asset_name AS "assetName",
            item.asset_category AS "assetCategory",
            item.asset_subcategory AS "assetSubcategory", item.unit,
            trim_scale(line.ordered_quantity)::text AS "orderedQuantity",
            trim_scale(line.received_quantity)::text AS "receivedQuantity",
            line.unit_price::text AS "unitPrice"
          FROM store.purchase_order_lines line
          JOIN store.item_types item ON item.id = line.item_type_id
          WHERE line.purchase_order_id = $1 AND line.organization_id = $2
          ORDER BY line.created_at, line.id
        `,
        [input.purchaseOrderId, input.organizationId]
      )
      return { lines: lines.rows, order: order.rows[0] }
    },

    async listSupplierPrices(organizationId: string) {
      const result = await pool.query<{
        id: string
        itemTypeId: string
        itemName: string
        quoteReference: string | null
        supplierId: string
        supplierName: string
        typeCode: string
        unitPrice: string
        validFrom: string
      }>(
        `
          SELECT price.id, price.item_type_id AS "itemTypeId",
            price.supplier_id AS "supplierId", item.type_code AS "typeCode",
            item.identification_name AS "itemName",
            supplier.name AS "supplierName",
            price.unit_price::text AS "unitPrice",
            price.valid_from::text AS "validFrom",
            price.quote_reference AS "quoteReference"
          FROM store.supplier_prices price
          JOIN store.item_types item ON item.id = price.item_type_id
          JOIN store.suppliers supplier ON supplier.id = price.supplier_id
          WHERE price.organization_id = $1
          ORDER BY price.valid_from DESC, item.type_code, supplier.name
          LIMIT 500
        `,
        [organizationId]
      )
      return result.rows
    },

    async createItemType(input: {
      actorUserId?: string | null
      assetCategoryId: string
      assetNameId: string
      assetSubcategoryId: string
      assetType: StoreAssetType
      applicableItemCode?: string | null
      drawingNumber?: string | null
      identificationName: string
      minimumStock?: number
      organizationId: string
      unit: string
    }) {
      return withTransaction(pool, async (client) => {
        const classification = await assetClassificationPath(client, input)
        const assetType = storeAssetType(input.assetType)
        const typeCode = await nextStoreTypeCode(client, input.organizationId)
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO store.item_types (
              organization_id, type_code, asset_type, asset_category,
              asset_subcategory, asset_name, asset_category_id,
              asset_subcategory_id, asset_name_id, identification_name,
              applicable_item_code, drawing_number, tracking_mode, unit,
              minimum_stock, created_by_user_id, updated_by_user_id
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
              $13, $14, $15, $16, $16
            )
            RETURNING id
          `,
          [
            input.organizationId,
            typeCode,
            assetType === "NON_CONSUMABLE" ? "Non Consumable" : "Consumable",
            classification.asset_category,
            classification.asset_subcategory,
            classification.asset_name,
            input.assetCategoryId,
            input.assetSubcategoryId,
            input.assetNameId,
            requiredText(input.identificationName, "Identification name"),
            input.applicableItemCode?.trim() || null,
            input.drawingNumber?.trim() || null,
            trackingModeForAssetType(assetType),
            requiredText(input.unit, "Unit"),
            input.minimumStock ?? 0,
            input.actorUserId ?? null,
          ]
        )
        return { id: result.rows[0]!.id, typeCode }
      })
    },

    async updateItemType(input: {
      actorUserId?: string | null
      assetCategoryId: string
      assetNameId: string
      assetSubcategoryId: string
      assetType: StoreAssetType
      applicableItemCode?: string | null
      drawingNumber?: string | null
      id: string
      identificationName: string
      minimumStock?: number
      organizationId: string
      unit: string
    }) {
      return withTransaction(pool, async (client) => {
        const classification = await assetClassificationPath(client, input)
        const assetType = storeAssetType(input.assetType)
        const result = await client.query<{ id: string }>(
          `UPDATE store.item_types
           SET asset_type = $1, asset_category = $2, asset_subcategory = $3,
             asset_name = $4, asset_category_id = $5,
             asset_subcategory_id = $6, asset_name_id = $7,
             identification_name = $8, applicable_item_code = $9,
             drawing_number = $10, tracking_mode = $11, unit = $12,
             minimum_stock = $13, updated_by_user_id = $14,
             updated_at = now()
           WHERE id = $15 AND organization_id = $16
           RETURNING id`,
          [
            assetType === "NON_CONSUMABLE" ? "Non Consumable" : "Consumable",
            classification.asset_category,
            classification.asset_subcategory,
            classification.asset_name,
            input.assetCategoryId,
            input.assetSubcategoryId,
            input.assetNameId,
            requiredText(input.identificationName, "Identification name"),
            input.applicableItemCode?.trim() || null,
            input.drawingNumber?.trim() || null,
            trackingModeForAssetType(assetType),
            requiredText(input.unit, "Unit"),
            input.minimumStock ?? 0,
            input.actorUserId ?? null,
            input.id,
            input.organizationId,
          ]
        )
        if (!result.rows[0]) throw new Error("Store Item Type was not found.")
        return result.rows[0]
      })
    },

    async listItemTypes(organizationId: string) {
      const result = await pool.query<{
        assetCategory: string
        assetCategoryId: string
        assetName: string
        assetNameId: string
        assetSubcategory: string
        assetSubcategoryId: string
        assetType: string
        applicableItemCode: string | null
        availableStock: string
        currentPriceValidFrom: string | null
        currentSupplierEmail: string | null
        currentSupplierId: string | null
        currentSupplierName: string | null
        currentUnitPrice: string | null
        drawingNumber: string | null
        id: string
        identificationName: string
        minimumStock: string
        storageLocations: string
        trackingMode: StoreTrackingMode
        typeCode: string
        unit: string
      }>(
        `
          SELECT item.id, item.type_code AS "typeCode",
            CASE WHEN item.tracking_mode = 'SERIALIZED'
              THEN 'NON_CONSUMABLE' ELSE 'CONSUMABLE' END AS "assetType",
            item.asset_category AS "assetCategory",
            item.asset_category_id AS "assetCategoryId",
            item.asset_subcategory AS "assetSubcategory",
            item.asset_subcategory_id AS "assetSubcategoryId",
            item.asset_name AS "assetName",
            item.asset_name_id AS "assetNameId",
            item.identification_name AS "identificationName",
            item.applicable_item_code AS "applicableItemCode",
            item.drawing_number AS "drawingNumber",
            item.tracking_mode AS "trackingMode", item.unit,
            trim_scale(item.minimum_stock)::text AS "minimumStock",
            current_price.supplier_id AS "currentSupplierId",
            current_price.supplier_name AS "currentSupplierName",
            current_price.supplier_email AS "currentSupplierEmail",
            current_price.unit_price AS "currentUnitPrice",
            current_price.valid_from AS "currentPriceValidFrom",
            COALESCE((
              SELECT string_agg(location.name, ', ' ORDER BY location.name)
              FROM store.locations location
              WHERE location.organization_id = item.organization_id
                AND location.location_type = 'STORE' AND location.active
                AND CASE WHEN item.tracking_mode = 'SERIALIZED'
                  THEN EXISTS (
                    SELECT 1 FROM store.assets asset
                    WHERE asset.item_type_id = item.id
                      AND asset.current_location_id = location.id
                      AND asset.status = 'AVAILABLE'
                  )
                  ELSE COALESCE((
                    SELECT sum(movement.quantity)
                    FROM store.stock_movements movement
                    WHERE movement.item_type_id = item.id
                      AND movement.location_id = location.id
                  ), 0) <> 0
                END
            ), 'Not in stock') AS "storageLocations",
            trim_scale((CASE WHEN item.tracking_mode = 'SERIALIZED'
              THEN (SELECT count(*)::numeric FROM store.assets asset
                WHERE asset.item_type_id = item.id AND asset.status = 'AVAILABLE')
              ELSE (SELECT COALESCE(sum(movement.quantity), 0)
                FROM store.stock_movements movement
                WHERE movement.item_type_id = item.id)
            END)::numeric)::text AS "availableStock"
          FROM store.item_types item
          LEFT JOIN LATERAL (
            SELECT price.supplier_id, supplier.name AS supplier_name,
              supplier.email AS supplier_email,
              price.unit_price::text AS unit_price,
              price.valid_from::text AS valid_from
            FROM store.supplier_prices price
            JOIN store.suppliers supplier ON supplier.id = price.supplier_id
            WHERE price.organization_id = item.organization_id
              AND price.item_type_id = item.id
              AND price.valid_from <= current_date AND supplier.active
            ORDER BY price.valid_from DESC, price.created_at DESC, price.id DESC
            LIMIT 1
          ) current_price ON true
          WHERE item.organization_id = $1 AND item.active
          ORDER BY item.type_code
        `,
        [organizationId]
      )
      return result.rows
    },

    async listRecentStockMovements(organizationId: string) {
      const result = await pool.query<{
        assetCode: string | null
        billNumber: string | null
        identificationName: string
        locationName: string
        movedAt: Date
        movedBy: string | null
        movementType: string
        quantity: string
        supplierName: string | null
        toHolder: string | null
        typeCode: string
        unit: string
      }>(
        `
          SELECT item.type_code AS "typeCode",
            item.identification_name AS "identificationName", item.unit,
            asset.asset_code AS "assetCode",
            movement.movement_type AS "movementType",
            trim_scale(movement.quantity)::text AS quantity,
            location.name AS "locationName",
            concat_ws(' / ', movement.to_holder_type,
              movement.to_holder_name, movement.to_holder_reference) AS "toHolder",
            movement.moved_at AS "movedAt", movement.moved_by AS "movedBy",
            receipt.bill_number AS "billNumber",
            supplier.name AS "supplierName"
          FROM store.stock_movements movement
          JOIN store.item_types item ON item.id = movement.item_type_id
          JOIN store.locations location ON location.id = movement.location_id
          LEFT JOIN store.assets asset ON asset.id = movement.asset_id
          LEFT JOIN store.receipt_lines line ON line.id = movement.receipt_line_id
          LEFT JOIN store.receipts receipt ON receipt.id = line.receipt_id
          LEFT JOIN store.suppliers supplier ON supplier.id = receipt.supplier_id
          WHERE movement.organization_id = $1
          ORDER BY movement.moved_at DESC
          LIMIT 300
        `,
        [organizationId]
      )
      return result.rows
    },

    async createCodeRequest(input: {
      actorUserId?: string | null
      assetCategoryId: string
      assetNameId: string
      assetSubcategoryId: string
      assetType: StoreAssetType
      department: string
      identificationName: string
      organizationId: string
      reason?: string | null
      requestedBy: string
    }) {
      return withTransaction(pool, async (client) => {
        const classification = await assetClassificationPath(client, input)
        const assetType = storeAssetType(input.assetType)
        const requestNumber = await nextDocumentNumber(client, {
          counterKey: "CODE_REQUEST",
          organizationId: input.organizationId,
          prefix: "STR-CODE",
        })
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO store.code_requests (
              organization_id, request_number, requested_asset_type,
              requested_category, requested_subcategory, requested_asset_name,
              requested_category_id, requested_subcategory_id,
              requested_asset_name_id,
              identification_name, requested_by, department, reason,
              created_by_user_id
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
            )
            RETURNING id
          `,
          [
            input.organizationId,
            requestNumber,
            assetType === "NON_CONSUMABLE" ? "Non Consumable" : "Consumable",
            classification.asset_category,
            classification.asset_subcategory,
            classification.asset_name,
            input.assetCategoryId,
            input.assetSubcategoryId,
            input.assetNameId,
            requiredText(input.identificationName, "Identification name"),
            requiredText(input.requestedBy, "Requested by"),
            requiredText(input.department, "Department"),
            input.reason?.trim() || null,
            input.actorUserId ?? null,
          ]
        )
        return { id: result.rows[0]!.id, requestNumber }
      })
    },

    async listCodeRequests(organizationId: string) {
      const result = await pool.query<{
        assetName: string
        createdAt: Date
        department: string
        id: string
        identificationName: string
        requestNumber: string
        requestedBy: string
        status: string
      }>(
        `
          SELECT id, request_number AS "requestNumber",
            requested_asset_name AS "assetName",
            identification_name AS "identificationName", requested_by AS "requestedBy",
            department, status, created_at AS "createdAt"
          FROM store.code_requests
          WHERE organization_id = $1
          ORDER BY created_at DESC
          LIMIT 200
        `,
        [organizationId]
      )
      return result.rows
    },

    async resolveCodeRequest(input: {
      actorUserId?: string | null
      codeRequestId: string
      itemTypeId: string
      organizationId: string
      resolution: "Code Created" | "Existing Code Found"
    }) {
      const result = await pool.query<{ id: string }>(
        `
          UPDATE store.code_requests request
          SET status = $1, resolved_item_type_id = item.id,
            resolved_at = now(), resolved_by_user_id = $2
          FROM store.item_types item
          WHERE request.id = $3 AND request.organization_id = $4
            AND item.id = $5 AND item.organization_id = request.organization_id
          RETURNING request.id
        `,
        [
          input.resolution,
          input.actorUserId ?? null,
          input.codeRequestId,
          input.organizationId,
          input.itemTypeId,
        ]
      )
      if (!result.rows[0])
        throw new Error("Code request or Store item was not found.")
      return result.rows[0]
    },

    async receiveStock(input: {
      actorUserId?: string | null
      billDate?: string | null
      billNumber?: string | null
      guaranteeCardFileName?: string | null
      guaranteeCardStorageKey?: string | null
      locationId: string
      manufacturerSerialNumbers?: string[]
      organizationId: string
      purchaseOrderLineId: string
      quantity: number
      receivedBy?: string | null
      warrantyUntil?: string | null
    }) {
      return withTransaction(pool, async (client) => {
        const quantity = positiveQuantity(input.quantity)
        const order = await client.query<{
          identification_name: string
          item_type_id: string
          next_asset_number: number
          order_number: string
          ordered_quantity: string
          received_quantity: string
          status: string
          supplier_id: string
          tracking_mode: StoreTrackingMode
          type_code: string
          unit_price: string
        }>(
          `
            SELECT line.item_type_id, purchase_order.supplier_id,
              purchase_order.order_number, line.ordered_quantity::text,
              line.received_quantity::text, line.unit_price::text,
              purchase_order.status, item.type_code, item.identification_name,
              item.tracking_mode, item.next_asset_number
            FROM store.purchase_order_lines line
            JOIN store.purchase_orders purchase_order
              ON purchase_order.id = line.purchase_order_id
            JOIN store.item_types item ON item.id = line.item_type_id
            WHERE line.id = $1 AND line.organization_id = $2
            FOR UPDATE OF line, purchase_order, item
          `,
          [input.purchaseOrderLineId, input.organizationId]
        )
        if (!order.rows[0]) throw new Error("Purchase Order was not found.")
        if (order.rows[0].status === "Cancelled") {
          throw new Error("A cancelled Purchase Order cannot be received.")
        }
        const remainingQuantity =
          Number(order.rows[0].ordered_quantity) -
          Number(order.rows[0].received_quantity)
        if (quantity > remainingQuantity) {
          throw new Error(
            `Receipt quantity exceeds the remaining Purchase Order quantity of ${remainingQuantity}.`
          )
        }
        if (
          order.rows[0].tracking_mode === "SERIALIZED" &&
          !Number.isInteger(quantity)
        ) {
          throw new Error("Non Consumable quantity must be a whole number.")
        }
        const receiptNumber = await nextDocumentNumber(client, {
          counterKey: "RECEIPT",
          organizationId: input.organizationId,
          prefix: "STR-GRN",
        })
        const receipt = await client.query<{ id: string }>(
          `
            INSERT INTO store.receipts (
              organization_id, receipt_number, purchase_order_line_id, location_id,
              supplier_id, bill_number, bill_date, received_by, created_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, '')::date, $8, $9)
            RETURNING id
          `,
          [
            input.organizationId,
            receiptNumber,
            input.purchaseOrderLineId,
            input.locationId,
            order.rows[0].supplier_id,
            input.billNumber?.trim() || null,
            input.billDate ?? null,
            input.receivedBy?.trim() || null,
            input.actorUserId ?? null,
          ]
        )
        const line = await client.query<{ id: string }>(
          `
            INSERT INTO store.receipt_lines (
              organization_id, receipt_id, item_type_id, quantity,
              unit_price, warranty_until
            ) VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::date)
            RETURNING id
          `,
          [
            input.organizationId,
            receipt.rows[0]!.id,
            order.rows[0].item_type_id,
            quantity,
            order.rows[0].unit_price,
            input.warrantyUntil ?? null,
          ]
        )
        if (input.billNumber?.trim()) {
          await client.query(
            `
              INSERT INTO store.documents (
                organization_id, receipt_id, document_type, bill_number,
                created_by_user_id
              ) VALUES ($1, $2, 'BILL', $3, $4)
            `,
            [
              input.organizationId,
              receipt.rows[0]!.id,
              input.billNumber.trim(),
              input.actorUserId ?? null,
            ]
          )
        }
        const assetCodes: string[] = []
        if (order.rows[0].tracking_mode === "SERIALIZED") {
          for (let index = 0; index < quantity; index += 1) {
            const number = order.rows[0].next_asset_number + index
            const assetCode = `${order.rows[0].type_code}-${String(number).padStart(5, "0")}`
            const asset = await client.query<{ id: string }>(
              `
                INSERT INTO store.assets (
                  organization_id, item_type_id, receipt_line_id, asset_code,
                  identification_name, manufacturer_serial_number,
                  current_location_id, warranty_until, acquired_on,
                  created_by_user_id, updated_by_user_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7,
                  NULLIF($8, '')::date, COALESCE(NULLIF($9, '')::date, current_date), $10, $10)
                RETURNING id
              `,
              [
                input.organizationId,
                order.rows[0].item_type_id,
                line.rows[0]!.id,
                assetCode,
                order.rows[0].identification_name,
                input.manufacturerSerialNumbers?.[index]?.trim() || null,
                input.locationId,
                input.warrantyUntil ?? null,
                input.billDate ?? null,
                input.actorUserId ?? null,
              ]
            )
            assetCodes.push(assetCode)
            await client.query(
              `
                INSERT INTO store.stock_movements (
                  organization_id, item_type_id, asset_id, location_id,
                  receipt_line_id, movement_type, quantity,
                  to_holder_type, to_holder_reference, moved_by,
                  created_by_user_id
                ) VALUES ($1, $2, $3, $4, $5, 'RECEIPT', 1,
                  'STORE', $4::uuid::text, $6, $7)
              `,
              [
                input.organizationId,
                order.rows[0].item_type_id,
                asset.rows[0]!.id,
                input.locationId,
                line.rows[0]!.id,
                input.receivedBy?.trim() || null,
                input.actorUserId ?? null,
              ]
            )
          }
          await client.query(
            `UPDATE store.item_types
             SET next_asset_number = next_asset_number + $1, updated_at = now()
             WHERE id = $2`,
            [quantity, order.rows[0].item_type_id]
          )
        } else {
          await client.query(
            `
              INSERT INTO store.stock_movements (
                organization_id, item_type_id, location_id, receipt_line_id,
                movement_type, quantity, to_holder_type,
                to_holder_reference, moved_by, created_by_user_id
              ) VALUES ($1, $2, $3, $4, 'RECEIPT', $5,
                'STORE', $3::uuid::text, $6, $7)
            `,
            [
              input.organizationId,
              order.rows[0].item_type_id,
              input.locationId,
              line.rows[0]!.id,
              quantity,
              input.receivedBy?.trim() || null,
              input.actorUserId ?? null,
            ]
          )
        }
        if (input.guaranteeCardFileName?.trim()) {
          await client.query(
            `
              INSERT INTO store.documents (
                organization_id, receipt_id, document_type, bill_number,
                file_name, storage_key, created_by_user_id
              ) VALUES ($1, $2, 'GUARANTEE_CARD', $3, $4, $5, $6)
            `,
            [
              input.organizationId,
              receipt.rows[0]!.id,
              input.billNumber?.trim() || null,
              input.guaranteeCardFileName.trim(),
              input.guaranteeCardStorageKey?.trim() || null,
              input.actorUserId ?? null,
            ]
          )
        }
        await client.query(
          `
            UPDATE store.purchase_order_lines
            SET received_quantity = received_quantity + $1,
              updated_at = now(), updated_by_user_id = $2
            WHERE id = $3
          `,
          [quantity, input.actorUserId ?? null, input.purchaseOrderLineId]
        )
        await client.query(
          `
            UPDATE store.purchase_orders purchase_order
            SET status = CASE
                WHEN NOT EXISTS (
                  SELECT 1 FROM store.purchase_order_lines line
                  WHERE line.purchase_order_id = purchase_order.id
                    AND line.received_quantity < line.ordered_quantity
                ) THEN 'Received'
                WHEN EXISTS (
                  SELECT 1 FROM store.purchase_order_lines line
                  WHERE line.purchase_order_id = purchase_order.id
                    AND line.received_quantity > 0
                ) THEN 'Partially Received'
                ELSE 'Open'
              END,
              updated_at = now(), updated_by_user_id = $1
            WHERE purchase_order.id = (
              SELECT line.purchase_order_id
              FROM store.purchase_order_lines line
              WHERE line.id = $2
            )
          `,
          [input.actorUserId ?? null, input.purchaseOrderLineId]
        )
        return { assetCodes, receiptNumber }
      })
    },

    createRequisitionBatch,

    async createRequisition(input: {
      actorUserId?: string | null
      department: string
      itemTypeId: string
      locationId: string
      organizationId: string
      purpose?: string | null
      quantity: number
      requestedBy: string
      requiredOn?: string | null
    }) {
      const result = await createRequisitionBatch({
        ...input,
        items: [{ itemTypeId: input.itemTypeId, quantity: input.quantity }],
      })
      return { id: result.lineIds[0]!, requestNumber: result.requestNumber }
    },

    async listRequisitions(input: {
      locationId?: string
      organizationId: string
    }) {
      const result = await pool.query<{
        assetCodeRequired: boolean
        availableStock: string
        department: string
        id: string
        identificationName: string
        issuedQuantity: string
        itemTypeId: string
        locationName: string
        remainingQuantity: string
        requestNumber: string
        requestedAt: Date
        requestedBy: string
        requestedQuantity: string
        status: string
        trackingMode: StoreTrackingMode
        typeCode: string
        unit: string
      }>(
        `
          SELECT request.id, request.item_type_id AS "itemTypeId",
            header.request_number AS "requestNumber",
            header.department, header.requested_by AS "requestedBy",
            trim_scale(request.requested_quantity)::text AS "requestedQuantity",
            trim_scale(request.issued_quantity)::text AS "issuedQuantity",
            trim_scale(request.requested_quantity - request.issued_quantity)::text AS "remainingQuantity",
            request.status, header.created_at AS "requestedAt",
            item.type_code AS "typeCode",
            item.identification_name AS "identificationName",
            item.tracking_mode AS "trackingMode", item.unit,
            (item.tracking_mode = 'SERIALIZED') AS "assetCodeRequired",
            location.name AS "locationName",
            trim_scale((CASE WHEN item.tracking_mode = 'SERIALIZED'
              THEN (SELECT count(*)::numeric FROM store.assets asset
                WHERE asset.item_type_id = request.item_type_id
                  AND asset.current_location_id = request.location_id
                  AND asset.status = 'AVAILABLE')
              ELSE (SELECT COALESCE(sum(movement.quantity), 0)
                FROM store.stock_movements movement
                WHERE movement.item_type_id = request.item_type_id
                  AND movement.location_id = request.location_id)
            END)::numeric)::text AS "availableStock"
          FROM store.requisitions request
          JOIN store.requisition_headers header
            ON header.id = request.request_header_id
          JOIN store.item_types item ON item.id = request.item_type_id
          JOIN store.locations location ON location.id = request.location_id
          WHERE request.organization_id = $1
            AND ($2::uuid IS NULL OR request.location_id = $2)
          ORDER BY
            CASE request.status WHEN 'Pending' THEN 0 WHEN 'Partially Issued' THEN 1 ELSE 2 END,
            header.created_at DESC, request.created_at
        `,
        [input.organizationId, input.locationId ?? null]
      )
      return { rows: result.rows }
    },

    async issueRequisition(input: {
      actorUserId?: string | null
      assetCode?: string | null
      holderName?: string | null
      holderReference?: string | null
      holderType?: StoreHolderType
      issuedBy?: string | null
      organizationId: string
      quantity: number
      remark?: string | null
      requisitionId: string
    }) {
      return withTransaction(pool, async (client) => {
        const quantity = positiveQuantity(input.quantity)
        const request = await client.query<{
          department: string
          issued_quantity: string
          item_type_id: string
          location_id: string
          requested_quantity: string
          status: string
          tracking_mode: StoreTrackingMode
        }>(
          `
            SELECT request.item_type_id, request.location_id,
              request.requested_quantity::text, request.issued_quantity::text,
              request.status, request.department, item.tracking_mode
            FROM store.requisitions request
            JOIN store.item_types item ON item.id = request.item_type_id
            WHERE request.id = $1 AND request.organization_id = $2
            FOR UPDATE OF request, item
          `,
          [input.requisitionId, input.organizationId]
        )
        const row = request.rows[0]
        if (!row) throw new Error("Store request was not found.")
        if (row.status === "Cancelled" || row.status === "Fulfilled") {
          throw new Error("This Store request is already closed.")
        }
        const remaining =
          Number(row.requested_quantity) - Number(row.issued_quantity)
        if (quantity > remaining) {
          throw new Error(`Only ${remaining} remains to be issued.`)
        }
        const holderType = input.holderType ?? "DEPARTMENT"
        const holderReference = input.holderReference?.trim() || row.department
        const holderName = input.holderName?.trim() || row.department
        if (row.tracking_mode === "SERIALIZED") {
          if (quantity !== 1) {
            throw new Error("Issue Non Consumables one Unit ID at a time.")
          }
          const assetCode = requiredText(input.assetCode, "Unit ID")
          const machineId =
            holderType === "MACHINE"
              ? await machineIdForReference(
                  client,
                  input.organizationId,
                  holderReference
                )
              : null
          const asset = await client.query<{ id: string }>(
            `
              UPDATE store.assets
              SET status = 'ASSIGNED', current_holder_type = $1,
                current_holder_reference = $2, current_holder_name = $3,
                current_machine_id = $4, current_location_id = NULL,
                updated_at = now(), updated_by_user_id = $5
              WHERE organization_id = $6
                AND lower(asset_code) = lower($7)
                AND item_type_id = $8
                AND current_location_id = $9
                AND status = 'AVAILABLE'
              RETURNING id
            `,
            [
              holderType,
              holderReference,
              holderName,
              machineId,
              input.actorUserId ?? null,
              input.organizationId,
              assetCode,
              row.item_type_id,
              row.location_id,
            ]
          )
          if (!asset.rows[0]) {
            throw new Error("Unit ID is not available in the selected Store.")
          }
          await client.query(
            `
              INSERT INTO store.stock_movements (
                organization_id, item_type_id, asset_id, location_id,
                requisition_id, movement_type, quantity,
                from_holder_type, from_holder_reference,
                to_holder_type, to_holder_reference, to_holder_name,
                moved_by, remark, created_by_user_id
              ) VALUES ($1, $2, $3, $4, $5, 'ISSUE', -1,
                'STORE', $4::uuid::text, $6, $7, $8, $9, $10, $11)
            `,
            [
              input.organizationId,
              row.item_type_id,
              asset.rows[0].id,
              row.location_id,
              input.requisitionId,
              holderType,
              holderReference,
              holderName,
              input.issuedBy?.trim() || null,
              input.remark?.trim() || null,
              input.actorUserId ?? null,
            ]
          )
        } else {
          const balance = await client.query<{ available: string }>(
            `
              SELECT COALESCE(sum(quantity), 0)::text AS available
              FROM store.stock_movements
              WHERE organization_id = $1 AND item_type_id = $2 AND location_id = $3
            `,
            [input.organizationId, row.item_type_id, row.location_id]
          )
          if (Number(balance.rows[0]!.available) < quantity) {
            throw new Error("Insufficient current stock for this issue.")
          }
          await client.query(
            `
              INSERT INTO store.stock_movements (
                organization_id, item_type_id, location_id, requisition_id,
                movement_type, quantity, from_holder_type,
                from_holder_reference, to_holder_type, to_holder_reference,
                to_holder_name, moved_by, remark, created_by_user_id
              ) VALUES ($1, $2, $3, $4, 'ISSUE', $5 * -1,
                'STORE', $3::uuid::text, $6, $7, $8, $9, $10, $11)
            `,
            [
              input.organizationId,
              row.item_type_id,
              row.location_id,
              input.requisitionId,
              quantity,
              holderType,
              holderReference,
              holderName,
              input.issuedBy?.trim() || null,
              input.remark?.trim() || null,
              input.actorUserId ?? null,
            ]
          )
        }
        const issuedQuantity = Number(row.issued_quantity) + quantity
        const status =
          issuedQuantity === Number(row.requested_quantity)
            ? "Fulfilled"
            : "Partially Issued"
        await client.query(
          `
            UPDATE store.requisitions
            SET issued_quantity = $1, status = $2, updated_at = now(),
              updated_by_user_id = $3
            WHERE id = $4
          `,
          [
            issuedQuantity,
            status,
            input.actorUserId ?? null,
            input.requisitionId,
          ]
        )
        return { issuedQuantity: String(issuedQuantity), status }
      })
    },

    async listAssets(input: { organizationId: string; query?: string }) {
      const result = await pool.query<{
        assetCode: string
        assetName: string
        holderName: string | null
        holderType: StoreHolderType
        id: string
        identificationName: string
        locationName: string | null
        nextDueOn: string | null
        status: string
        typeCode: string
      }>(
        `
          SELECT asset.id, asset.asset_code AS "assetCode",
            item.type_code AS "typeCode", item.asset_name AS "assetName",
            asset.identification_name AS "identificationName",
            asset.status, asset.current_holder_type AS "holderType",
            asset.current_holder_name AS "holderName",
            location.name AS "locationName",
            (SELECT min(schedule.next_due_on)::text
              FROM store.asset_maintenance_schedules schedule
              WHERE schedule.asset_id = asset.id AND schedule.active) AS "nextDueOn"
          FROM store.assets asset
          JOIN store.item_types item ON item.id = asset.item_type_id
          LEFT JOIN store.locations location ON location.id = asset.current_location_id
          WHERE asset.organization_id = $1
            AND ($2 = '' OR concat_ws(' ', asset.asset_code, item.type_code,
              item.asset_name, asset.identification_name,
              asset.current_holder_name) ILIKE '%' || $2 || '%')
          ORDER BY asset.asset_code
        `,
        [input.organizationId, input.query?.trim() ?? ""]
      )
      return result.rows
    },

    async getAssetWorkspace(input: {
      assetCode: string
      organizationId: string
    }) {
      const asset = await pool.query<{
        acquiredOn: string | null
        assetCode: string
        assetName: string
        assetType: string
        category: string
        holderName: string | null
        holderReference: string | null
        holderType: StoreHolderType
        id: string
        identificationName: string
        locationName: string | null
        manufacturerSerialNumber: string | null
        orderNumber: string | null
        status: string
        subcategory: string
        supplierName: string | null
        typeCode: string
        unitPrice: string | null
        warrantyUntil: string | null
      }>(
        `
          SELECT asset.id, asset.asset_code AS "assetCode",
            item.type_code AS "typeCode",
            CASE WHEN item.tracking_mode = 'SERIALIZED'
              THEN 'NON_CONSUMABLE' ELSE 'CONSUMABLE' END AS "assetType",
            item.asset_category AS category,
            item.asset_subcategory AS subcategory,
            item.asset_name AS "assetName",
            asset.identification_name AS "identificationName",
            asset.manufacturer_serial_number AS "manufacturerSerialNumber",
            asset.status, asset.current_holder_type AS "holderType",
            asset.current_holder_reference AS "holderReference",
            asset.current_holder_name AS "holderName",
            location.name AS "locationName",
            asset.warranty_until::text AS "warrantyUntil",
            asset.acquired_on::text AS "acquiredOn",
            purchase_order.order_number AS "orderNumber",
            supplier.name AS "supplierName",
            receipt_line.unit_price::text AS "unitPrice"
          FROM store.assets asset
          JOIN store.item_types item ON item.id = asset.item_type_id
          LEFT JOIN store.locations location ON location.id = asset.current_location_id
          LEFT JOIN store.receipt_lines receipt_line
            ON receipt_line.id = asset.receipt_line_id
          LEFT JOIN store.receipts receipt ON receipt.id = receipt_line.receipt_id
          LEFT JOIN store.purchase_order_lines purchase_order_line
            ON purchase_order_line.id = receipt.purchase_order_line_id
          LEFT JOIN store.purchase_orders purchase_order
            ON purchase_order.id = purchase_order_line.purchase_order_id
          LEFT JOIN store.suppliers supplier ON supplier.id = receipt.supplier_id
          WHERE asset.organization_id = $1 AND lower(asset.asset_code) = lower($2)
        `,
        [input.organizationId, requiredText(input.assetCode, "Unit ID")]
      )
      if (!asset.rows[0]) return null
      const movements = await pool.query<{
        fromHolder: string | null
        movedAt: Date
        movedBy: string | null
        movementType: string
        quantity: string
        remark: string | null
        toHolder: string | null
      }>(
        `
          SELECT movement_type AS "movementType", quantity::text,
            concat_ws(' / ', from_holder_type, from_holder_name,
              from_holder_reference) AS "fromHolder",
            concat_ws(' / ', to_holder_type, to_holder_name,
              to_holder_reference) AS "toHolder",
            moved_at AS "movedAt", moved_by AS "movedBy", remark
          FROM store.stock_movements
          WHERE organization_id = $1 AND asset_id = $2
          ORDER BY moved_at DESC
        `,
        [input.organizationId, asset.rows[0].id]
      )
      const schedules = await pool.query<{
        active: boolean
        code: string
        frequencyDays: number
        id: string
        lastCompletedOn: string | null
        name: string
        nextDueOn: string
      }>(
        `
          SELECT schedule.id, definition.code, definition.name,
            definition.frequency_value AS "frequencyDays",
            schedule.last_completed_on::text AS "lastCompletedOn",
            schedule.next_due_on::text AS "nextDueOn", schedule.active
          FROM store.asset_maintenance_schedules schedule
          JOIN maintenance.definitions definition ON definition.id = schedule.definition_id
          WHERE schedule.organization_id = $1 AND schedule.asset_id = $2
          ORDER BY schedule.next_due_on
        `,
        [input.organizationId, asset.rows[0].id]
      )
      const maintenance = await pool.query<{
        certificateNumber: string | null
        completedBy: string
        completedOn: string
        cost: string | null
        id: string
        maintenanceType: string
        nextDueOn: string | null
        result: string | null
        workDone: string | null
      }>(
        `
          SELECT id, maintenance_type AS "maintenanceType",
            completed_on::text AS "completedOn", completed_by AS "completedBy",
            certificate_number AS "certificateNumber", work_done AS "workDone",
            result, cost::text, next_due_on::text AS "nextDueOn"
          FROM store.asset_maintenance_records
          WHERE organization_id = $1 AND asset_id = $2
          ORDER BY completed_on DESC, created_at DESC
        `,
        [input.organizationId, asset.rows[0].id]
      )
      const documents = await pool.query<{
        billNumber: string | null
        documentType: string
        fileName: string | null
        id: string
        storageKey: string | null
      }>(
        `
          SELECT document.id, document.document_type AS "documentType",
            document.bill_number AS "billNumber", document.file_name AS "fileName",
            document.storage_key AS "storageKey"
          FROM store.documents document
          WHERE document.organization_id = $1
            AND (
              document.asset_id = $2
              OR document.receipt_id = (
                SELECT line.receipt_id FROM store.assets linked_asset
                JOIN store.receipt_lines line ON line.id = linked_asset.receipt_line_id
                WHERE linked_asset.id = $2
              )
            )
          ORDER BY document.created_at DESC
        `,
        [input.organizationId, asset.rows[0].id]
      )
      const supplierPrices = await pool.query<{
        quoteReference: string | null
        supplierName: string
        unitPrice: string
        validFrom: string
      }>(
        `
          SELECT supplier.name AS "supplierName",
            price.unit_price::text AS "unitPrice",
            price.valid_from::text AS "validFrom",
            price.quote_reference AS "quoteReference"
          FROM store.supplier_prices price
          JOIN store.suppliers supplier ON supplier.id = price.supplier_id
          JOIN store.assets linked_asset ON linked_asset.item_type_id = price.item_type_id
          WHERE price.organization_id = $1 AND linked_asset.id = $2
          ORDER BY price.valid_from DESC, price.created_at DESC
          LIMIT 100
        `,
        [input.organizationId, asset.rows[0].id]
      )
      return {
        asset: asset.rows[0],
        documents: documents.rows,
        maintenance: maintenance.rows,
        movements: movements.rows,
        schedules: schedules.rows,
        supplierPrices: supplierPrices.rows,
      }
    },

    async moveAsset(input: {
      actorUserId?: string | null
      assetCode: string
      holderName?: string | null
      holderReference?: string | null
      holderType: StoreHolderType
      movedBy?: string | null
      organizationId: string
      remark?: string | null
      vendorId?: string | null
    }) {
      return withTransaction(pool, async (client) => {
        const asset = await client.query<{
          current_holder_name: string | null
          current_holder_reference: string | null
          current_holder_type: StoreHolderType
          current_location_id: string | null
          id: string
          item_type_id: string
          status: string
        }>(
          `
            SELECT id, item_type_id, current_location_id, status,
              current_holder_type, current_holder_reference, current_holder_name
            FROM store.assets
            WHERE organization_id = $1 AND lower(asset_code) = lower($2)
            FOR UPDATE
          `,
          [input.organizationId, requiredText(input.assetCode, "Unit ID")]
        )
        if (!asset.rows[0]) throw new Error("Asset was not found.")
        if (asset.rows[0].status === "SCRAPPED") {
          throw new Error("A scrapped asset cannot be moved or reassigned.")
        }
        const machineId =
          input.holderType === "MACHINE"
            ? await machineIdForReference(
                client,
                input.organizationId,
                input.holderReference
              )
            : null
        const destinationVendor =
          input.holderType === "VENDOR"
            ? await client.query<{ code: string; id: string; name: string }>(
                `
                  SELECT id, code, name FROM store.vendors
                  WHERE organization_id = $1 AND id = $2 AND active
                `,
                [input.organizationId, input.vendorId ?? null]
              )
            : null
        if (input.holderType === "VENDOR" && !destinationVendor?.rows[0]) {
          throw new Error("Select a Vendor from Vendor Master.")
        }
        const destinationStore =
          input.holderType === "STORE"
            ? await client.query<{ code: string; id: string; name: string }>(
                `
                  SELECT id, code, name FROM store.locations
                  WHERE organization_id = $1 AND location_type = 'STORE'
                    AND (id::text = $2 OR lower(code) = lower($2))
                `,
                [input.organizationId, input.holderReference]
              )
            : null
        if (input.holderType === "STORE" && !destinationStore?.rows[0]) {
          throw new Error("Destination Store location was not found.")
        }
        const fallbackLocation = await client.query<{ id: string }>(
          `SELECT id FROM store.locations
           WHERE organization_id = $1 AND active ORDER BY created_at LIMIT 1`,
          [input.organizationId]
        )
        const locationId =
          asset.rows[0].current_location_id ??
          destinationStore?.rows[0]?.id ??
          fallbackLocation.rows[0]?.id
        if (!locationId) throw new Error("A Store location is required.")
        const destinationReference =
          destinationVendor?.rows[0]?.code ??
          destinationStore?.rows[0]?.code ??
          requiredText(input.holderReference, "Holder reference")
        const destinationName =
          destinationVendor?.rows[0]?.name ??
          destinationStore?.rows[0]?.name ??
          requiredText(input.holderName, "Holder name")
        await client.query(
          `
            UPDATE store.assets SET status = $1,
              current_holder_type = $2, current_holder_reference = $3,
              current_holder_name = $4, current_machine_id = $5,
              current_vendor_id = $6, current_location_id = $7,
              updated_at = now(), updated_by_user_id = $8
            WHERE id = $9
          `,
          [
            input.holderType === "STORE" ? "AVAILABLE" : "ASSIGNED",
            input.holderType,
            destinationReference,
            destinationName,
            machineId,
            destinationVendor?.rows[0]?.id ?? null,
            destinationStore?.rows[0]?.id ?? null,
            input.actorUserId ?? null,
            asset.rows[0].id,
          ]
        )
        await client.query(
          `
            INSERT INTO store.stock_movements (
              organization_id, item_type_id, asset_id, location_id,
              movement_type, quantity, from_holder_type,
              from_holder_reference, from_holder_name, to_holder_type,
              to_holder_reference, to_holder_name, moved_by, remark,
              created_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10, $11, $12, $13, $14, $15)
          `,
          [
            input.organizationId,
            asset.rows[0].item_type_id,
            asset.rows[0].id,
            locationId,
            input.holderType === "STORE" ? "RETURN" : "TRANSFER_OUT",
            input.holderType === "STORE" ? 1 : -1,
            asset.rows[0].current_holder_type,
            asset.rows[0].current_holder_reference,
            asset.rows[0].current_holder_name,
            input.holderType,
            destinationReference,
            destinationName,
            input.movedBy?.trim() || null,
            input.remark?.trim() || null,
            input.actorUserId ?? null,
          ]
        )
      })
    },

    async scheduleAssetMaintenance(input: {
      actorUserId?: string | null
      assetCode: string
      definitionCode: string
      firstDueOn: string
      organizationId: string
    }) {
      const result = await pool.query<{ id: string }>(
        `
          INSERT INTO store.asset_maintenance_schedules (
            organization_id, asset_id, definition_id, first_due_on,
            next_due_on, created_by_user_id, updated_by_user_id
          )
          SELECT $1, asset.id, definition.id, $4::date, $4::date, $5, $5
          FROM store.assets asset
          JOIN maintenance.definitions definition
            ON definition.organization_id = asset.organization_id
            AND lower(definition.code) = lower($3)
          WHERE asset.organization_id = $1 AND lower(asset.asset_code) = lower($2)
          ON CONFLICT (asset_id, definition_id)
          DO UPDATE SET first_due_on = EXCLUDED.first_due_on,
            next_due_on = EXCLUDED.next_due_on, active = true,
            updated_at = now(), updated_by_user_id = EXCLUDED.updated_by_user_id
          RETURNING id
        `,
        [
          input.organizationId,
          requiredText(input.assetCode, "Unit ID"),
          requiredText(input.definitionCode, "Maintenance code"),
          requiredText(input.firstDueOn, "First due date"),
          input.actorUserId ?? null,
        ]
      )
      if (!result.rows[0]) {
        throw new Error("Unit ID or Maintenance Master code was not found.")
      }
      return result.rows[0]
    },

    async setAssetLifecycleStatus(input: {
      actorUserId?: string | null
      assetCode: string
      changedBy?: string | null
      organizationId: string
      remark?: string | null
      status: "BROKEN" | "SCRAPPED" | "UNDER_MAINTENANCE"
    }) {
      return withTransaction(pool, async (client) => {
        const asset = await client.query<{
          current_holder_name: string | null
          current_holder_reference: string | null
          current_holder_type: StoreHolderType
          current_location_id: string | null
          id: string
          item_type_id: string
        }>(
          `
            SELECT id, item_type_id, current_location_id, current_holder_type,
              current_holder_reference, current_holder_name
            FROM store.assets
            WHERE organization_id = $1 AND lower(asset_code) = lower($2)
            FOR UPDATE
          `,
          [input.organizationId, requiredText(input.assetCode, "Unit ID")]
        )
        if (!asset.rows[0]) throw new Error("Asset was not found.")
        const fallbackLocation = await client.query<{ id: string }>(
          `SELECT id FROM store.locations
           WHERE organization_id = $1 AND active ORDER BY created_at LIMIT 1`,
          [input.organizationId]
        )
        const locationId =
          asset.rows[0].current_location_id ?? fallbackLocation.rows[0]?.id
        if (!locationId) throw new Error("A Store location is required.")
        await client.query(
          `
            UPDATE store.assets SET status = $1,
              current_machine_id = CASE WHEN $1 = 'SCRAPPED' THEN NULL ELSE current_machine_id END,
              updated_at = now(), updated_by_user_id = $2
            WHERE id = $3
          `,
          [input.status, input.actorUserId ?? null, asset.rows[0].id]
        )
        await client.query(
          `
            INSERT INTO store.stock_movements (
              organization_id, item_type_id, asset_id, location_id,
              movement_type, quantity, from_holder_type,
              from_holder_reference, from_holder_name, to_holder_type,
              to_holder_reference, to_holder_name, moved_by, remark,
              created_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
              $7, $8, $9, $10, $11, $12)
          `,
          [
            input.organizationId,
            asset.rows[0].item_type_id,
            asset.rows[0].id,
            locationId,
            input.status === "SCRAPPED" ? "SCRAP" : "ADJUSTMENT",
            input.status === "SCRAPPED" ? -1 : 1,
            asset.rows[0].current_holder_type,
            asset.rows[0].current_holder_reference,
            asset.rows[0].current_holder_name,
            input.changedBy?.trim() || null,
            input.remark?.trim() || `Status changed to ${input.status}.`,
            input.actorUserId ?? null,
          ]
        )
      })
    },

    async completeAssetMaintenance(input: {
      actorUserId?: string | null
      assetCode: string
      certificateNumber?: string | null
      completedBy: string
      completedOn: string
      cost?: string | null
      maintenanceType: "BREAKDOWN" | "CALIBRATION" | "MAINTENANCE"
      organizationId: string
      result?: string | null
      scheduleId?: string | null
      supplierName?: string | null
      workDone?: string | null
    }) {
      return withTransaction(pool, async (client) => {
        const asset = await client.query<{ id: string }>(
          `SELECT id FROM store.assets
           WHERE organization_id = $1 AND lower(asset_code) = lower($2)`,
          [input.organizationId, requiredText(input.assetCode, "Unit ID")]
        )
        if (!asset.rows[0]) throw new Error("Asset was not found.")
        let nextDueOn: string | null = null
        if (input.scheduleId) {
          const schedule = await client.query<{
            frequency_value: number
          }>(
            `
              SELECT definition.frequency_value
              FROM store.asset_maintenance_schedules schedule
              JOIN maintenance.definitions definition ON definition.id = schedule.definition_id
              WHERE schedule.id = $1 AND schedule.asset_id = $2
              FOR UPDATE OF schedule
            `,
            [input.scheduleId, asset.rows[0].id]
          )
          if (!schedule.rows[0])
            throw new Error("Asset maintenance schedule was not found.")
          const due = await client.query<{ next_due_on: string }>(
            `SELECT ($1::date + $2::integer)::text AS next_due_on`,
            [input.completedOn, schedule.rows[0].frequency_value]
          )
          nextDueOn = due.rows[0]!.next_due_on
          await client.query(
            `
              UPDATE store.asset_maintenance_schedules
              SET last_completed_on = $1::date, next_due_on = $2::date,
                updated_at = now(), updated_by_user_id = $3
              WHERE id = $4
            `,
            [
              input.completedOn,
              nextDueOn,
              input.actorUserId ?? null,
              input.scheduleId,
            ]
          )
        }
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO store.asset_maintenance_records (
              organization_id, asset_id, schedule_id, maintenance_type,
              completed_on, completed_by, supplier_name, certificate_number,
              work_done, result, cost, next_due_on, created_by_user_id
            ) VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10,
              NULLIF($11, '')::numeric, $12::date, $13)
            RETURNING id
          `,
          [
            input.organizationId,
            asset.rows[0].id,
            input.scheduleId ?? null,
            input.maintenanceType,
            requiredText(input.completedOn, "Completed date"),
            requiredText(input.completedBy, "Completed by"),
            input.supplierName?.trim() || null,
            input.certificateNumber?.trim() || null,
            input.workDone?.trim() || null,
            input.result?.trim() || null,
            input.cost ?? null,
            nextDueOn,
            input.actorUserId ?? null,
          ]
        )
        return { id: result.rows[0]!.id, nextDueOn }
      })
    },

    async listMaintenanceDefinitions(organizationId: string) {
      const result = await pool.query<{
        code: string
        frequencyDays: number
        name: string
      }>(
        `
          SELECT code, name, frequency_value AS "frequencyDays"
          FROM maintenance.definitions
          WHERE organization_id = $1 AND active
          ORDER BY code
        `,
        [organizationId]
      )
      return result.rows
    },

    async listAssetsForMachine(input: {
      machineNumber: string
      organizationId: string
    }) {
      const result = await pool.query<{
        assetCode: string
        assetName: string
        assignedAt: Date | null
        identificationName: string
        status: string
        typeCode: string
      }>(
        `
          SELECT asset.asset_code AS "assetCode", item.type_code AS "typeCode",
            item.asset_name AS "assetName",
            asset.identification_name AS "identificationName", asset.status,
            (SELECT max(movement.moved_at) FROM store.stock_movements movement
              WHERE movement.asset_id = asset.id
                AND movement.to_holder_type = 'MACHINE'
                AND lower(movement.to_holder_reference) = lower(machine.machine_number)
            ) AS "assignedAt"
          FROM store.assets asset
          JOIN store.item_types item ON item.id = asset.item_type_id
          JOIN catalog.machines machine ON machine.id = asset.current_machine_id
          WHERE asset.organization_id = $1
            AND lower(machine.machine_number) = lower($2)
          ORDER BY asset.asset_code
        `,
        [
          input.organizationId,
          requiredText(input.machineNumber, "Machine number"),
        ]
      )
      return result.rows
    },

    async listAssetHistoryForMachine(input: {
      machineNumber: string
      organizationId: string
    }) {
      const result = await pool.query<{
        assetCode: string
        assetName: string
        fromHolder: string | null
        identificationName: string
        movedAt: Date
        movementType: string
        toHolder: string | null
        typeCode: string
      }>(
        `
          SELECT asset.asset_code AS "assetCode", item.type_code AS "typeCode",
            item.asset_name AS "assetName",
            asset.identification_name AS "identificationName",
            movement.movement_type AS "movementType",
            concat_ws(' / ', movement.from_holder_type,
              movement.from_holder_name, movement.from_holder_reference) AS "fromHolder",
            concat_ws(' / ', movement.to_holder_type,
              movement.to_holder_name, movement.to_holder_reference) AS "toHolder",
            movement.moved_at AS "movedAt"
          FROM store.stock_movements movement
          JOIN store.assets asset ON asset.id = movement.asset_id
          JOIN store.item_types item ON item.id = asset.item_type_id
          WHERE movement.organization_id = $1
            AND (
              (movement.to_holder_type = 'MACHINE'
                AND lower(movement.to_holder_reference) = lower($2))
              OR (movement.from_holder_type = 'MACHINE'
                AND lower(movement.from_holder_reference) = lower($2))
            )
          ORDER BY movement.moved_at DESC
          LIMIT 500
        `,
        [
          input.organizationId,
          requiredText(input.machineNumber, "Machine number"),
        ]
      )
      return result.rows
    },

    async getAssetDocument(input: {
      assetCode: string
      documentId: string
      organizationId: string
    }) {
      const result = await pool.query<{
        fileName: string
        storageKey: string
      }>(
        `
          SELECT document.file_name AS "fileName",
            document.storage_key AS "storageKey"
          FROM store.documents document
          JOIN store.assets asset ON asset.organization_id = document.organization_id
          LEFT JOIN store.receipt_lines line ON line.id = asset.receipt_line_id
          WHERE document.id = $1 AND document.organization_id = $2
            AND lower(asset.asset_code) = lower($3)
            AND (document.asset_id = asset.id OR document.receipt_id = line.receipt_id)
            AND document.file_name IS NOT NULL
            AND document.storage_key IS NOT NULL
          LIMIT 1
        `,
        [input.documentId, input.organizationId, input.assetCode]
      )
      if (!result.rows[0]) throw new Error("Store document was not found.")
      return result.rows[0]
    },
  }
}
