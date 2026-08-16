import type { PoolClient } from "pg"

import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"

export type StoreTrackingMode = "CONSUMABLE" | "SERIALIZED"
export type StoreHolderType =
  | "DEPARTMENT"
  | "MACHINE"
  | "PERSON"
  | "STORE"
  | "UNIT"

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

    async createSupplier(input: {
      actorUserId?: string | null
      code: string
      contactDetails?: string | null
      name: string
      organizationId: string
    }) {
      const result = await pool.query<{ id: string }>(
        `
          INSERT INTO store.suppliers (
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
          requiredText(input.code, "Supplier code"),
          requiredText(input.name, "Supplier name"),
          input.contactDetails?.trim() || null,
          input.actorUserId ?? null,
        ]
      )
      return result.rows[0]!
    },

    async listSuppliers(organizationId: string) {
      const result = await pool.query<{
        code: string
        contactDetails: string | null
        id: string
        name: string
      }>(
        `
          SELECT id, code, name, contact_details AS "contactDetails"
          FROM store.suppliers
          WHERE organization_id = $1 AND active
          ORDER BY name
        `,
        [organizationId]
      )
      return result.rows
    },

    async listSupplierPrices(organizationId: string) {
      const result = await pool.query<{
        itemName: string
        quoteReference: string | null
        supplierName: string
        typeCode: string
        unitPrice: string
        validFrom: string
      }>(
        `
          SELECT item.type_code AS "typeCode",
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
      assetCategory: string
      assetName: string
      assetSubcategory: string
      assetType: string
      applicableItemCode?: string | null
      drawingNumber?: string | null
      identificationName: string
      minimumStock?: number
      organizationId: string
      trackingMode: StoreTrackingMode
      typeCode: string
      unit: string
    }) {
      const result = await pool.query<{ id: string }>(
        `
          INSERT INTO store.item_types (
            organization_id, type_code, asset_type, asset_category,
            asset_subcategory, asset_name, identification_name,
            applicable_item_code, drawing_number, tracking_mode, unit, minimum_stock,
            created_by_user_id, updated_by_user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
          RETURNING id
        `,
        [
          input.organizationId,
          requiredText(input.typeCode, "Asset type code"),
          requiredText(input.assetType, "Asset type"),
          requiredText(input.assetCategory, "Asset category"),
          requiredText(input.assetSubcategory, "Asset subcategory"),
          requiredText(input.assetName, "Asset name"),
          requiredText(input.identificationName, "Identification name"),
          input.applicableItemCode?.trim() || null,
          input.drawingNumber?.trim() || null,
          input.trackingMode,
          requiredText(input.unit, "Unit"),
          input.minimumStock ?? 0,
          input.actorUserId ?? null,
        ]
      )
      return result.rows[0]!
    },

    async listItemTypes(organizationId: string) {
      const result = await pool.query<{
        assetCategory: string
        assetName: string
        assetSubcategory: string
        assetType: string
        applicableItemCode: string | null
        availableStock: string
        drawingNumber: string | null
        id: string
        identificationName: string
        minimumStock: string
        trackingMode: StoreTrackingMode
        typeCode: string
        unit: string
      }>(
        `
          SELECT item.id, item.type_code AS "typeCode",
            item.asset_type AS "assetType",
            item.asset_category AS "assetCategory",
            item.asset_subcategory AS "assetSubcategory",
            item.asset_name AS "assetName",
            item.identification_name AS "identificationName",
            item.applicable_item_code AS "applicableItemCode",
            item.drawing_number AS "drawingNumber",
            item.tracking_mode AS "trackingMode", item.unit,
            trim_scale(item.minimum_stock)::text AS "minimumStock",
            trim_scale((CASE WHEN item.tracking_mode = 'SERIALIZED'
              THEN (SELECT count(*)::numeric FROM store.assets asset
                WHERE asset.item_type_id = item.id AND asset.status = 'AVAILABLE')
              ELSE (SELECT COALESCE(sum(movement.quantity), 0)
                FROM store.stock_movements movement
                WHERE movement.item_type_id = item.id)
            END)::numeric)::text AS "availableStock"
          FROM store.item_types item
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
      assetCategory: string
      assetName: string
      assetSubcategory: string
      assetType: string
      department: string
      identificationName: string
      organizationId: string
      reason?: string | null
      requestedBy: string
    }) {
      return withTransaction(pool, async (client) => {
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
              identification_name, requested_by, department, reason,
              created_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
          `,
          [
            input.organizationId,
            requestNumber,
            requiredText(input.assetType, "Asset type"),
            requiredText(input.assetCategory, "Asset category"),
            requiredText(input.assetSubcategory, "Asset subcategory"),
            requiredText(input.assetName, "Asset name"),
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
      itemTypeId: string
      locationId: string
      manufacturerSerialNumbers?: string[]
      organizationId: string
      quantity: number
      receivedBy?: string | null
      supplierId?: string | null
      unitPrice: string
      warrantyUntil?: string | null
    }) {
      return withTransaction(pool, async (client) => {
        const quantity = positiveQuantity(input.quantity)
        const item = await client.query<{
          identification_name: string
          next_asset_number: number
          tracking_mode: StoreTrackingMode
          type_code: string
        }>(
          `
            SELECT type_code, identification_name, tracking_mode, next_asset_number
            FROM store.item_types
            WHERE id = $1 AND organization_id = $2
            FOR UPDATE
          `,
          [input.itemTypeId, input.organizationId]
        )
        if (!item.rows[0]) throw new Error("Store item type was not found.")
        if (
          item.rows[0].tracking_mode === "SERIALIZED" &&
          !Number.isInteger(quantity)
        ) {
          throw new Error("Serialized asset quantity must be a whole number.")
        }
        const receiptNumber = await nextDocumentNumber(client, {
          counterKey: "RECEIPT",
          organizationId: input.organizationId,
          prefix: "STR-GRN",
        })
        const receipt = await client.query<{ id: string }>(
          `
            INSERT INTO store.receipts (
              organization_id, receipt_number, location_id, supplier_id,
              bill_number, bill_date, received_by, created_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::date, $7, $8)
            RETURNING id
          `,
          [
            input.organizationId,
            receiptNumber,
            input.locationId,
            input.supplierId ?? null,
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
            input.itemTypeId,
            quantity,
            input.unitPrice,
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
        if (input.supplierId) {
          await client.query(
            `
              INSERT INTO store.supplier_prices (
                organization_id, item_type_id, supplier_id, unit_price,
                valid_from, quote_reference, created_by_user_id
              ) VALUES ($1, $2, $3, $4, COALESCE(NULLIF($5, '')::date, current_date), $6, $7)
            `,
            [
              input.organizationId,
              input.itemTypeId,
              input.supplierId,
              input.unitPrice,
              input.billDate ?? null,
              input.billNumber?.trim() || null,
              input.actorUserId ?? null,
            ]
          )
        }
        const assetCodes: string[] = []
        if (item.rows[0].tracking_mode === "SERIALIZED") {
          for (let index = 0; index < quantity; index += 1) {
            const number = item.rows[0].next_asset_number + index
            const assetCode = `${item.rows[0].type_code}-${String(number).padStart(5, "0")}`
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
                input.itemTypeId,
                line.rows[0]!.id,
                assetCode,
                item.rows[0].identification_name,
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
                input.itemTypeId,
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
            [quantity, input.itemTypeId]
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
              input.itemTypeId,
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
        return { assetCodes, receiptNumber }
      })
    },

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
      return withTransaction(pool, async (client) => {
        const requestNumber = await nextDocumentNumber(client, {
          counterKey: "REQUISITION",
          organizationId: input.organizationId,
          prefix: "STR-REQ",
        })
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO store.requisitions (
              organization_id, request_number, item_type_id, location_id,
              department, requested_by, requested_quantity, required_on,
              purpose, created_by_user_id, updated_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7,
              NULLIF($8, '')::date, $9, $10, $10)
            RETURNING id
          `,
          [
            input.organizationId,
            requestNumber,
            input.itemTypeId,
            input.locationId,
            requiredText(input.department, "Department"),
            requiredText(input.requestedBy, "Requested by"),
            positiveQuantity(input.quantity),
            input.requiredOn ?? null,
            input.purpose?.trim() || null,
            input.actorUserId ?? null,
          ]
        )
        return { id: result.rows[0]!.id, requestNumber }
      })
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
          SELECT request.id, request.request_number AS "requestNumber",
            request.department, request.requested_by AS "requestedBy",
            trim_scale(request.requested_quantity)::text AS "requestedQuantity",
            trim_scale(request.issued_quantity)::text AS "issuedQuantity",
            trim_scale(request.requested_quantity - request.issued_quantity)::text AS "remainingQuantity",
            request.status, request.created_at AS "requestedAt",
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
          JOIN store.item_types item ON item.id = request.item_type_id
          JOIN store.locations location ON location.id = request.location_id
          WHERE request.organization_id = $1
            AND ($2::uuid IS NULL OR request.location_id = $2)
          ORDER BY
            CASE request.status WHEN 'Pending' THEN 0 WHEN 'Partially Issued' THEN 1 ELSE 2 END,
            request.created_at DESC
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
            throw new Error("Issue serialized assets one Asset Code at a time.")
          }
          const assetCode = requiredText(input.assetCode, "Asset code")
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
            throw new Error(
              "Asset Code is not available in the selected Store."
            )
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
          LIMIT 500
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
        status: string
        subcategory: string
        typeCode: string
        warrantyUntil: string | null
      }>(
        `
          SELECT asset.id, asset.asset_code AS "assetCode",
            item.type_code AS "typeCode", item.asset_type AS "assetType",
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
            asset.acquired_on::text AS "acquiredOn"
          FROM store.assets asset
          JOIN store.item_types item ON item.id = asset.item_type_id
          LEFT JOIN store.locations location ON location.id = asset.current_location_id
          WHERE asset.organization_id = $1 AND lower(asset.asset_code) = lower($2)
        `,
        [input.organizationId, requiredText(input.assetCode, "Asset code")]
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
      return {
        asset: asset.rows[0],
        documents: documents.rows,
        maintenance: maintenance.rows,
        movements: movements.rows,
        schedules: schedules.rows,
      }
    },

    async moveAsset(input: {
      actorUserId?: string | null
      assetCode: string
      holderName: string
      holderReference: string
      holderType: StoreHolderType
      movedBy?: string | null
      organizationId: string
      remark?: string | null
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
          [input.organizationId, requiredText(input.assetCode, "Asset code")]
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
          destinationStore?.rows[0]?.code ??
          requiredText(input.holderReference, "Holder reference")
        const destinationName =
          destinationStore?.rows[0]?.name ??
          requiredText(input.holderName, "Holder name")
        await client.query(
          `
            UPDATE store.assets SET status = $1,
              current_holder_type = $2, current_holder_reference = $3,
              current_holder_name = $4, current_machine_id = $5,
              current_location_id = $6, updated_at = now(),
              updated_by_user_id = $7
            WHERE id = $8
          `,
          [
            input.holderType === "STORE" ? "AVAILABLE" : "ASSIGNED",
            input.holderType,
            destinationReference,
            destinationName,
            machineId,
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
          requiredText(input.assetCode, "Asset code"),
          requiredText(input.definitionCode, "Maintenance code"),
          requiredText(input.firstDueOn, "First due date"),
          input.actorUserId ?? null,
        ]
      )
      if (!result.rows[0]) {
        throw new Error("Asset Code or Maintenance Master code was not found.")
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
          [input.organizationId, requiredText(input.assetCode, "Asset code")]
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
          [input.organizationId, requiredText(input.assetCode, "Asset code")]
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
