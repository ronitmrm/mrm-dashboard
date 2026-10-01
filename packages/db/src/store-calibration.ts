import { createHash } from "node:crypto"

import type { Pool, PoolClient } from "pg"

import type { ArtifactByteLocator, ArtifactStorageProviderIdentifier } from "./artifacts"
import { queueDashboardRefresh } from "./dashboard-refresh-queue"
import { withTransaction } from "./postgres-runtime"
import {
  getStorePurchaseOrderWithClient,
  hasIssuedStorePurchaseOrderPdf,
  nextDocumentNumber,
} from "./store"
import { assertToolingTransferAvailable, lockToolingAllocation } from "./tooling-availability"

type Actor = { actorUserId?: string | null; organizationId: string }
type VisitStatus = "OPEN" | "DISPATCHED" | "RETURNED" | "PASSED" | "FAILED" | "CANCELLED"

function required(value: string | null | undefined, label: string) {
  const result = value?.trim()
  if (!result) throw new Error(`${label} is required.`)
  return result
}

function price(value: string) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0 || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Quoted price must be a non-negative amount with at most two decimal places.")
  }
  return amount.toFixed(2)
}

async function linkedFile(
  client: PoolClient,
  input: {
    fileId: string
    organizationId: string
    purpose: string
    targetId: string
    targetTable: string
  }
) {
  const result = await client.query<{ id: string }>(
    `SELECT file.id
     FROM core.file_links link
     JOIN core.files file ON file.id = link.file_id
     JOIN core.file_objects object ON object.id = file.physical_object_id
     WHERE link.organization_id = $1 AND link.file_id = $2
       AND link.target_schema = 'store' AND link.target_table = $3
       AND link.target_id = $4 AND link.purpose = $5 AND link.is_current
       AND file.lifecycle_state = 'current'
       AND object.lifecycle_state <> 'deleted'
     FOR SHARE OF link, file, object`,
    [input.organizationId, input.fileId, input.targetTable, input.targetId, input.purpose]
  )
  if (!result.rows[0]) throw new Error("The uploaded file is not attached to this calibration record.")
}

async function hasUnresolvedCalibrationFailure(
  client: PoolClient,
  organizationId: string,
  assetId: string
) {
  const result = await client.query(
    `SELECT 1 FROM store.calibration_visits failed
     WHERE failed.organization_id = $1 AND failed.asset_id = $2
       AND failed.status = 'FAILED'
       AND NOT EXISTS (
         SELECT 1 FROM store.calibration_visits passed
         WHERE passed.organization_id = $1
           AND passed.asset_id = failed.asset_id
           AND passed.schedule_id = failed.schedule_id
           AND passed.status = 'PASSED'
           AND (passed.created_at, passed.id) >
             (failed.created_at, failed.id)
       )
     LIMIT 1`,
    [organizationId, assetId]
  )
  return Boolean(result.rows[0])
}

export function createStoreCalibrationRepository(pool: Pool) {
  return {
    async listCalibrationPlan(organizationId: string, from: string, to: string) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
        throw new Error("Select a valid date range.")
      }
      const result = await pool.query<{
        assetName: string
        category: string
        certificateFileName: string | null
        subcategory: string
        completedOn: string | null
        dueOn: string
        id: string
        method: "SUPPLIER" | "IN_HOUSE" | null
        scheduleName: string
        scheduleId: string
        status: VisitStatus | "Planned"
        supplierName: string | null
        typeCode: string
        unitId: string
        visitId: string | null
      }>(
        `WITH planned AS (
           SELECT 'schedule-' || schedule.id::text AS id,
             schedule.id AS schedule_id, schedule.next_due_on AS due_on,
             'Planned'::text AS status, NULL::uuid AS visit_id
           FROM store.asset_maintenance_schedules schedule
           WHERE schedule.organization_id = $1
             AND schedule.schedule_type = 'CALIBRATION' AND schedule.active
             AND schedule.next_due_on >= $2::date
             AND schedule.next_due_on <= $3::date
             AND NOT EXISTS (
               SELECT 1 FROM store.calibration_visits visit
               WHERE visit.organization_id = $1 AND visit.schedule_id = schedule.id
                 AND visit.due_on = schedule.next_due_on
                 AND visit.status <> 'CANCELLED'
             )
           UNION ALL
           SELECT visit.id::text, visit.schedule_id, visit.due_on,
             visit.status, visit.id
           FROM store.calibration_visits visit
           WHERE visit.organization_id = $1 AND visit.status <> 'CANCELLED'
             AND visit.due_on >= $2::date
             AND visit.due_on <= $3::date
         )
         SELECT planned.id, planned.schedule_id AS "scheduleId", visit.method,
           visit.id AS "visitId",
           planned.due_on::text AS "dueOn", planned.status,
           asset.asset_code AS "unitId",
           item.type_code AS "typeCode", item.asset_name AS "assetName",
           item.asset_category AS category, item.asset_subcategory AS subcategory,
           COALESCE(definition.name, schedule.name) AS "scheduleName",
           record.completed_on::text AS "completedOn",
           certificate.file_name AS "certificateFileName",
           supplier.name AS "supplierName"
         FROM planned
         JOIN store.asset_maintenance_schedules schedule
           ON schedule.id = planned.schedule_id AND schedule.organization_id = $1
         LEFT JOIN maintenance.definitions definition ON definition.id = schedule.definition_id
         JOIN store.assets asset ON asset.id = schedule.asset_id
           AND asset.organization_id = $1
         JOIN store.item_types item ON item.id = asset.item_type_id
         LEFT JOIN store.calibration_visits visit ON visit.id = planned.visit_id
         LEFT JOIN store.calibration_offers offer ON offer.id = visit.selected_offer_id
         LEFT JOIN store.suppliers supplier ON supplier.id = offer.supplier_id
         LEFT JOIN store.asset_maintenance_records record ON record.id = visit.maintenance_record_id
         LEFT JOIN core.files certificate ON certificate.id = visit.certificate_file_id
         ORDER BY planned.due_on, asset.asset_code, planned.id`,
        [organizationId, from, to]
      )
      return result.rows
    },

    async listCalibrationWorklist(input: {
      includeFuture?: boolean
      organizationId: string
    }) {
      const result = await pool.query<{
        accountableStoreCode: string
        accountableStoreId: string
        accountableStoreName: string
        assetId: string
        assetName: string
        category: string
        certificateFileName: string | null
        currentHolderName: string | null
        currentHolderType: string
        dueOn: string
        id: string
        method: "SUPPLIER" | "IN_HOUSE" | null
        purchaseOrderId: string | null
        purchaseOrderIssuanceState: string | null
        purchaseOrderNumber: string | null
        scheduleId: string
        scheduleName: string
        scope: string | null
        selectedOfferId: string | null
        status: VisitStatus | "Planned"
        subcategory: string
        typeCode: string
        unitId: string
        visitId: string | null
      }>(
        `WITH work AS (
           SELECT 'schedule-' || schedule.id::text AS id,
             schedule.id AS schedule_id, schedule.next_due_on AS due_on,
             'Planned'::text AS status, NULL::uuid AS visit_id
           FROM store.asset_maintenance_schedules schedule
           WHERE schedule.organization_id = $1
             AND schedule.schedule_type = 'CALIBRATION' AND schedule.active
             AND ($2::boolean OR schedule.next_due_on <=
               (now() AT TIME ZONE 'Asia/Kolkata')::date)
             AND NOT EXISTS (
               SELECT 1 FROM store.calibration_visits visit
               WHERE visit.organization_id = $1
                 AND visit.schedule_id = schedule.id
                 AND visit.due_on = schedule.next_due_on
                 AND visit.status <> 'CANCELLED'
             )
           UNION ALL
           SELECT visit.id::text, visit.schedule_id, visit.due_on,
             visit.status, visit.id
           FROM store.calibration_visits visit
           WHERE visit.organization_id = $1
             AND visit.status IN ('OPEN', 'DISPATCHED', 'RETURNED', 'FAILED')
             AND ($2::boolean OR visit.due_on <=
               (now() AT TIME ZONE 'Asia/Kolkata')::date
               OR visit.status = 'FAILED')
             AND NOT (visit.status = 'FAILED' AND EXISTS (
               SELECT 1 FROM store.calibration_visits later
               WHERE later.organization_id = $1
                 AND later.schedule_id = visit.schedule_id
                 AND later.asset_id = visit.asset_id
                 AND later.due_on = visit.due_on
                 AND later.status <> 'CANCELLED'
                 AND (later.created_at, later.id) >
                   (visit.created_at, visit.id)
             ))
         )
         SELECT work.id, work.schedule_id AS "scheduleId",
           work.due_on::text AS "dueOn", work.status,
           visit.id AS "visitId", visit.method, visit.scope,
           visit.selected_offer_id AS "selectedOfferId",
           visit.purchase_order_id AS "purchaseOrderId",
           purchase_order.order_number AS "purchaseOrderNumber",
           purchase_order.issuance_state AS "purchaseOrderIssuanceState",
           certificate.file_name AS "certificateFileName",
           asset.id AS "assetId", asset.asset_code AS "unitId",
           asset.current_holder_type AS "currentHolderType",
           asset.current_holder_name AS "currentHolderName",
           accountable.id AS "accountableStoreId",
           accountable.code AS "accountableStoreCode",
           accountable.name AS "accountableStoreName",
           item.type_code AS "typeCode", item.asset_name AS "assetName",
           item.asset_category AS category,
           item.asset_subcategory AS subcategory,
           COALESCE(definition.name, schedule.name) AS "scheduleName"
         FROM work
         JOIN store.asset_maintenance_schedules schedule
           ON schedule.id = work.schedule_id
         LEFT JOIN maintenance.definitions definition
           ON definition.id = schedule.definition_id
         JOIN store.assets asset ON asset.id = schedule.asset_id
           AND asset.organization_id = $1
         JOIN store.accountable_stores accountable
           ON accountable.id = asset.accountable_store_id
         JOIN store.item_types item ON item.id = asset.item_type_id
         LEFT JOIN store.calibration_visits visit ON visit.id = work.visit_id
         LEFT JOIN store.purchase_orders purchase_order
           ON purchase_order.id = visit.purchase_order_id
         LEFT JOIN core.files certificate
           ON certificate.id = visit.certificate_file_id
         ORDER BY work.due_on, asset.asset_code, work.id`,
        [input.organizationId, input.includeFuture ?? false]
      )
      return result.rows
    },

    async listCalibrationAssignmentCandidates(input: {
      organizationId: string
      search?: string | null
    }) {
      const result = await pool.query<{
        accountableStoreCode: string
        accountableStoreId: string
        accountableStoreName: string
        assetId: string
        assetName: string
        activeScheduleCount: number
        typeCode: string
        unitId: string
      }>(
        `SELECT asset.id AS "assetId", asset.asset_code AS "unitId",
           item.type_code AS "typeCode", item.asset_name AS "assetName",
           accountable.id AS "accountableStoreId",
           accountable.code AS "accountableStoreCode",
           accountable.name AS "accountableStoreName",
           count(schedule.id)::integer AS "activeScheduleCount"
         FROM store.assets asset
         JOIN store.item_types item ON item.id = asset.item_type_id
           AND item.tracking_mode = 'SERIALIZED'
         JOIN store.accountable_stores accountable
           ON accountable.id = asset.accountable_store_id
         LEFT JOIN store.asset_maintenance_schedules schedule
           ON schedule.asset_id = asset.id
           AND schedule.organization_id = $1
           AND schedule.schedule_type = 'CALIBRATION'
           AND schedule.active
         WHERE asset.organization_id = $1 AND asset.status <> 'SCRAPPED'
           AND ($2::text IS NULL OR asset.asset_code ILIKE '%' || $2 || '%'
             OR item.asset_name ILIKE '%' || $2 || '%'
             OR item.type_code ILIKE '%' || $2 || '%')
         GROUP BY asset.id, item.id, accountable.id
         ORDER BY asset.asset_code
         LIMIT 100`,
        [input.organizationId, input.search?.trim() || null]
      )
      return result.rows
    },

    async listCalibrationVisits(input: { assetId: string; organizationId: string }) {
      const visits = await pool.query<{
        agreedPrice: string | null
        certificateFileId: string | null
        certificateFileName: string | null
        certificateNumber: string | null
        completedOn: string | null
        dispatchedOn: Date | null
        dueOn: string
        id: string
        maintenanceRecordId: string | null
        method: "SUPPLIER" | "IN_HOUSE"
        purchaseOrderNumber: string | null
        purchaseOrderIssuanceState: string | null
        purchaseOrderId: string | null
        result: string | null
        returnedOn: Date | null
        scheduleId: string
        scheduleName: string
        scope: string
        selectedOfferId: string | null
        status: VisitStatus
        supplierName: string | null
      }>(
        `SELECT visit.id, visit.schedule_id AS "scheduleId",
           COALESCE(definition.name, schedule.name) AS "scheduleName",
           visit.due_on::text AS "dueOn", visit.scope, visit.status, visit.method,
           visit.selected_offer_id AS "selectedOfferId",
           visit.agreed_price::text AS "agreedPrice",
           visit.purchase_order_id AS "purchaseOrderId",
           purchase_order.order_number AS "purchaseOrderNumber",
           purchase_order.issuance_state AS "purchaseOrderIssuanceState",
           outbound.moved_at AS "dispatchedOn", returned.moved_at AS "returnedOn",
           visit.maintenance_record_id AS "maintenanceRecordId",
           visit.certificate_file_id AS "certificateFileId",
           certificate.file_name AS "certificateFileName",
           supplier.name AS "supplierName", record.result,
           record.completed_on::text AS "completedOn",
           record.certificate_number AS "certificateNumber"
         FROM store.calibration_visits visit
         JOIN store.asset_maintenance_schedules schedule ON schedule.id = visit.schedule_id
         LEFT JOIN maintenance.definitions definition ON definition.id = schedule.definition_id
         LEFT JOIN store.calibration_offers offer ON offer.id = visit.selected_offer_id
         LEFT JOIN store.suppliers supplier ON supplier.id = offer.supplier_id
         LEFT JOIN store.purchase_orders purchase_order ON purchase_order.id = visit.purchase_order_id
         LEFT JOIN store.stock_movements outbound ON outbound.id = visit.outbound_movement_id
         LEFT JOIN store.stock_movements returned ON returned.id = visit.return_movement_id
         LEFT JOIN store.asset_maintenance_records record ON record.id = visit.maintenance_record_id
         LEFT JOIN core.files certificate ON certificate.id = visit.certificate_file_id
         WHERE visit.organization_id = $1 AND visit.asset_id = $2
         ORDER BY visit.created_at DESC, visit.id DESC`,
        [input.organizationId, input.assetId]
      )
      const offers = await pool.query<{
        id: string
        notes: string | null
        quoteFileId: string | null
        quoteFileName: string | null
        quoteReference: string | null
        quotedOn: string
        quotedPrice: string
        supplierCode: string
        supplierId: string
        supplierName: string
        visitId: string
      }>(
        `SELECT offer.id, offer.visit_id AS "visitId",
           offer.supplier_id AS "supplierId", supplier.code AS "supplierCode",
           supplier.name AS "supplierName", offer.quoted_price::text AS "quotedPrice",
           offer.quoted_on::text AS "quotedOn", offer.quote_reference AS "quoteReference",
           offer.quote_file_id AS "quoteFileId",
           quote.file_name AS "quoteFileName", offer.notes
         FROM store.calibration_offers offer
         JOIN store.suppliers supplier ON supplier.id = offer.supplier_id
         JOIN store.calibration_visits visit ON visit.id = offer.visit_id
         LEFT JOIN core.files quote ON quote.id = offer.quote_file_id
         WHERE visit.organization_id = $1 AND visit.asset_id = $2
         ORDER BY offer.quoted_on DESC, offer.created_at DESC`,
        [input.organizationId, input.assetId]
      )
      return visits.rows.map((visit) => ({
        ...visit,
        offers: offers.rows.filter((offer) => offer.visitId === visit.id),
      }))
    },

    async getCalibrationCertificate(input: {
      assetCode: string
      organizationId: string
      visitId: string
    }): Promise<ArtifactByteLocator | null> {
      const result = await pool.query<{
        byteSize: string
        fileName: string
        mediaType: string | null
        physicalObjectId: string
        provider: ArtifactStorageProviderIdentifier
        providerKey: string
        sha256: string
      }>(
        `SELECT file.file_name AS "fileName", file.media_type AS "mediaType",
           file.physical_object_id AS "physicalObjectId",
           object.provider, object.provider_key AS "providerKey",
           object.byte_size::text AS "byteSize", object.sha256
         FROM store.calibration_visits visit
         JOIN store.assets asset ON asset.id = visit.asset_id
         JOIN core.files file ON file.id = visit.certificate_file_id
         JOIN core.file_links link ON link.file_id = file.id
         JOIN core.file_objects object ON object.id = file.physical_object_id
         WHERE visit.id = $1 AND visit.organization_id = $2
           AND asset.organization_id = $2
           AND lower(asset.asset_code) = lower($3)
           AND link.organization_id = $2
           AND link.target_schema = 'store'
           AND link.target_table = 'calibration_visits'
           AND link.target_id = visit.id
           AND link.purpose = 'calibration_certificate' AND link.is_current
           AND file.lifecycle_state = 'current'
           AND object.lifecycle_state <> 'deleted'
         LIMIT 1`,
        [input.visitId, input.organizationId, input.assetCode]
      )
      const file = result.rows[0]
      return file ? { ...file, byteSize: Number(file.byteSize), storageKey: null } : null
    },

    async getCalibrationOfferQuote(input: {
      assetCode: string
      offerId: string
      organizationId: string
    }): Promise<ArtifactByteLocator | null> {
      const result = await pool.query<{
        byteSize: string
        fileName: string
        mediaType: string | null
        physicalObjectId: string
        provider: ArtifactStorageProviderIdentifier
        providerKey: string
        sha256: string
      }>(
        `SELECT file.file_name AS "fileName", file.media_type AS "mediaType",
           file.physical_object_id AS "physicalObjectId",
           object.provider, object.provider_key AS "providerKey",
           object.byte_size::text AS "byteSize", object.sha256
         FROM store.calibration_offers offer
         JOIN store.calibration_visits visit ON visit.id = offer.visit_id
         JOIN store.assets asset ON asset.id = visit.asset_id
         JOIN core.files file ON file.id = offer.quote_file_id
         JOIN core.file_links link ON link.file_id = file.id
         JOIN core.file_objects object ON object.id = file.physical_object_id
         WHERE offer.id = $1 AND offer.organization_id = $2
           AND visit.organization_id = $2 AND asset.organization_id = $2
           AND lower(asset.asset_code) = lower($3)
           AND link.organization_id = $2
           AND link.target_schema = 'store'
           AND link.target_table = 'calibration_offers'
           AND link.target_id = offer.id
           AND link.purpose = 'calibration_quote' AND link.is_current
           AND file.lifecycle_state = 'current'
           AND object.lifecycle_state <> 'deleted'
         LIMIT 1`,
        [input.offerId, input.organizationId, input.assetCode]
      )
      const file = result.rows[0]
      return file ? { ...file, byteSize: Number(file.byteSize), storageKey: null } : null
    },

    async openCalibrationVisit(input: Actor & {
      assetCode: string
      method?: "SUPPLIER" | "IN_HOUSE"
      scheduleId: string
      scope?: string | null
    }) {
      return withTransaction(pool, async (client) => {
        const schedule = await client.query<{
          assetId: string
          name: string
          nextDueOn: string
          status: string
          holderType: string
        }>(
          `SELECT asset.id AS "assetId", asset.status,
             asset.current_holder_type AS "holderType",
             COALESCE(definition.name, schedule.name) AS name,
             schedule.next_due_on::text AS "nextDueOn"
           FROM store.asset_maintenance_schedules schedule
           JOIN store.assets asset ON asset.id = schedule.asset_id
           LEFT JOIN maintenance.definitions definition ON definition.id = schedule.definition_id
           WHERE schedule.organization_id = $1 AND schedule.id = $2
             AND asset.organization_id = $1
             AND lower(asset.asset_code) = lower($3)
             AND schedule.schedule_type = 'CALIBRATION' AND schedule.active
           FOR UPDATE OF schedule, asset`,
          [input.organizationId, input.scheduleId, required(input.assetCode, "Unit ID")]
        )
        const row = schedule.rows[0]
        if (!row) throw new Error("An active calibration timetable was not found for this Unit ID.")
        if (row.status === "SCRAPPED" || row.status === "BROKEN") {
          throw new Error("A broken or scrapped unit cannot be calibrated.")
        }
        if (input.method === "IN_HOUSE" &&
          !["STORE", "MACHINE", "DEPARTMENT"].includes(row.holderType)) {
          throw new Error("This Unit ID is not available for in-house calibration.")
        }
        const result = await client.query<{ id: string }>(
          `INSERT INTO store.calibration_visits (
             organization_id, asset_id, schedule_id, due_on, scope, method,
             created_by_user_id, updated_by_user_id
           ) VALUES ($1, $2, $3, $4::date, $5, $6, $7, $7)
           RETURNING id`,
          [input.organizationId, row.assetId, input.scheduleId,
            row.nextDueOn, required(input.scope || row.name, "Calibration scope"),
            input.method ?? "SUPPLIER", input.actorUserId ?? null]
        )
        return result.rows[0]!
      })
    },

    async addCalibrationOffer(input: Actor & {
      accountableStoreId: string
      notes?: string | null
      quoteReference?: string | null
      quotedOn?: string | null
      quotedPrice: string
      supplierId: string
      visitId: string
    }) {
      return withTransaction(pool, async (client) => {
        const visit = await client.query<{ id: string }>(
          `SELECT visit.id FROM store.calibration_visits visit
           JOIN store.assets asset ON asset.id = visit.asset_id
           WHERE visit.id = $1 AND visit.organization_id = $2
             AND visit.status = 'OPEN' AND visit.method = 'SUPPLIER'
             AND asset.accountable_store_id = $3
           FOR UPDATE OF visit`,
          [input.visitId, input.organizationId, input.accountableStoreId]
        )
        if (!visit.rows[0]) throw new Error("Open calibration visit was not found.")
        const supplier = await client.query<{ id: string }>(
          `SELECT id FROM store.suppliers
           WHERE id = $1 AND organization_id = $2 AND active`,
          [input.supplierId, input.organizationId]
        )
        if (!supplier.rows[0]) throw new Error("Select an active Store Supplier.")
        const result = await client.query<{ id: string }>(
          `INSERT INTO store.calibration_offers (
             organization_id, visit_id, supplier_id, quoted_price,
             quoted_on, quote_reference, notes, created_by_user_id
           ) VALUES ($1, $2, $3, $4::numeric,
             COALESCE(NULLIF($5, '')::date, current_date), $6, $7, $8)
           RETURNING id`,
          [input.organizationId, input.visitId, input.supplierId,
            price(input.quotedPrice), input.quotedOn ?? null,
            input.quoteReference?.trim() || null, input.notes?.trim() || null,
            input.actorUserId ?? null]
        )
        return result.rows[0]!
      })
    },

    async cancelCalibrationVisit(input: Actor & {
      method: "SUPPLIER" | "IN_HOUSE"
      visitId: string
    }) {
      return withTransaction(pool, async (client) => {
        const visit = await client.query<{
          id: string
          method: "SUPPLIER" | "IN_HOUSE"
          outboundMovementId: string | null
          status: VisitStatus
        }>(
          `SELECT id, method, status, outbound_movement_id AS "outboundMovementId"
           FROM store.calibration_visits
           WHERE id = $1 AND organization_id = $2
           FOR UPDATE`,
          [input.visitId, input.organizationId]
        )
        if (!visit.rows[0] || visit.rows[0].method !== input.method ||
          visit.rows[0].status !== "OPEN" ||
          visit.rows[0].outboundMovementId) {
          throw new Error("Only an undispatched calibration visit can be cancelled.")
        }
        const order = await client.query<{ id: string; issuanceState: string; status: string }>(
          `SELECT id, issuance_state AS "issuanceState", status
           FROM store.purchase_orders
           WHERE organization_id = $1 AND issuance_id = $2::uuid
           FOR UPDATE`,
          [input.organizationId, input.visitId]
        )
        if (order.rows[0]) {
          if (order.rows[0].issuanceState !== "pending" || order.rows[0].status !== "Open") {
            throw new Error("This calibration service PO was already issued.")
          }
          await client.query(
            `UPDATE store.purchase_orders
             SET status = 'Cancelled', updated_at = now(),
               updated_by_user_id = $2 WHERE id = $1`,
            [order.rows[0].id, input.actorUserId ?? null]
          )
        }
        await client.query(
          `UPDATE store.calibration_visits
           SET status = 'CANCELLED', updated_at = now(),
             updated_by_user_id = $2 WHERE id = $1`,
          [input.visitId, input.actorUserId ?? null]
        )
        return { id: input.visitId }
      })
    },

    async prepareCalibrationDispatch(input: Actor & {
      accountableStoreId: string
      offerId: string
      orderDate?: string | null
      remark?: string | null
      visitId: string
    }) {
      const prepared = await withTransaction(pool, async (client) => {
        const visit = await client.query<{
          assetCode: string
          assetId: string
          accountableStoreId: string
          dueOn: string
          purchaseOrderId: string | null
          scheduleId: string
          selectedOfferId: string | null
          scope: string
          status: VisitStatus
        }>(
          `SELECT visit.asset_id AS "assetId", asset.asset_code AS "assetCode",
             asset.accountable_store_id AS "accountableStoreId",
             visit.schedule_id AS "scheduleId", visit.due_on::text AS "dueOn",
             visit.purchase_order_id AS "purchaseOrderId",
             visit.selected_offer_id AS "selectedOfferId",
             visit.scope, visit.status
           FROM store.calibration_visits visit
           JOIN store.assets asset ON asset.id = visit.asset_id
           WHERE visit.id = $1 AND visit.organization_id = $2
             AND visit.method = 'SUPPLIER'
           FOR UPDATE OF visit, asset`,
          [input.visitId, input.organizationId]
        )
        const row = visit.rows[0]
        if (!row || row.status !== "OPEN") throw new Error("Open calibration visit was not found.")
        if (row.accountableStoreId !== input.accountableStoreId) {
          throw new Error("This Unit ID belongs to another accountable store.")
        }
        const offer = await client.query<{
          quotedPrice: string
          supplierId: string
        }>(
          `SELECT offer.quoted_price::text AS "quotedPrice",
             offer.supplier_id AS "supplierId"
           FROM store.calibration_offers offer
           JOIN store.suppliers supplier ON supplier.id = offer.supplier_id
           WHERE offer.id = $1 AND offer.visit_id = $2
             AND offer.organization_id = $3 AND supplier.organization_id = $3
             AND supplier.active`,
          [input.offerId, input.visitId, input.organizationId]
        )
        if (!offer.rows[0]) throw new Error("Select a current calibration Supplier offer.")
        if (row.purchaseOrderId) {
          if (row.selectedOfferId !== input.offerId) {
            throw new Error("This visit is already linked to another Supplier offer.")
          }
          const linked = await client.query<{
            id: string
            issuanceState: string
            orderNumber: string
            originStoreId: string
            supplierId: string
          }>(
            `SELECT id, order_number AS "orderNumber",
               issuance_state AS "issuanceState",
               origin_store_id AS "originStoreId",
               supplier_id AS "supplierId"
             FROM store.purchase_orders
             WHERE id = $1 AND organization_id = $2 AND status = 'Open'
             FOR UPDATE`,
            [row.purchaseOrderId, input.organizationId]
          )
          if (!linked.rows[0] ||
            linked.rows[0].originStoreId !== input.accountableStoreId ||
            linked.rows[0].supplierId !== offer.rows[0].supplierId) {
            throw new Error("This visit is already linked to a different service PO.")
          }
          return { purchaseOrderId: linked.rows[0].id,
            orderNumber: linked.rows[0].orderNumber,
            alreadyIssued: linked.rows[0].issuanceState === "issued" }
        }
        const retry = await client.query<{
          id: string
          orderNumber: string
          supplierId: string
        }>(
          `SELECT purchase_order.id,
             purchase_order.order_number AS "orderNumber",
             purchase_order.supplier_id AS "supplierId"
           FROM store.purchase_orders purchase_order
           JOIN store.calibration_visits prior
             ON prior.purchase_order_id = purchase_order.id
           WHERE prior.asset_id = $1 AND prior.organization_id = $2
             AND prior.status = 'FAILED'
             AND prior.schedule_id = $4 AND prior.due_on = $5::date
             AND purchase_order.organization_id = $2
             AND purchase_order.origin_store_id = $3
             AND purchase_order.order_type = 'REPAIR'
             AND purchase_order.issuance_state = 'issued'
             AND purchase_order.status = 'Open'
           ORDER BY prior.created_at DESC, prior.id DESC
           LIMIT 1 FOR UPDATE OF purchase_order`,
          [row.assetId, input.organizationId, input.accountableStoreId,
            row.scheduleId, row.dueOn]
        )
        if (retry.rows[0]) {
          if (retry.rows[0].supplierId !== offer.rows[0].supplierId) {
            throw new Error("Corrective calibration must use the Supplier on the open service PO.")
          }
          if (Number(offer.rows[0].quotedPrice) !== 0) {
            throw new Error("Corrective work under an existing service PO must have a zero-price offer.")
          }
          await client.query(
            `UPDATE store.calibration_visits
             SET selected_offer_id = $1, agreed_price = $2::numeric,
               purchase_order_id = $3, updated_at = now(),
               updated_by_user_id = $4
             WHERE id = $5`,
            [input.offerId, offer.rows[0].quotedPrice, retry.rows[0].id,
              input.actorUserId ?? null, input.visitId]
          )
          return { purchaseOrderId: retry.rows[0].id,
            orderNumber: retry.rows[0].orderNumber, alreadyIssued: true }
        }
        const fingerprint = createHash("sha256").update(JSON.stringify({
          visitId: input.visitId,
          offerId: input.offerId,
          supplierId: offer.rows[0].supplierId,
          price: Number(offer.rows[0].quotedPrice).toFixed(2),
          scope: row.scope,
          remark: input.remark?.trim() || null,
        })).digest("hex")
        const existing = await client.query<{
          id: string
          issuanceFingerprint: string
          issuanceState: string
          orderNumber: string
        }>(
          `SELECT id, issuance_fingerprint AS "issuanceFingerprint",
             issuance_state AS "issuanceState",
             order_number AS "orderNumber"
           FROM store.purchase_orders
           WHERE organization_id = $1 AND issuance_id = $2::uuid
           FOR UPDATE`,
          [input.organizationId, input.visitId]
        )
        if (existing.rows[0]) {
          if (existing.rows[0].issuanceFingerprint !== fingerprint) {
            throw new Error("This calibration visit already has a service PO for another offer.")
          }
          await client.query(
            `UPDATE store.calibration_visits
             SET selected_offer_id = $1, agreed_price = $2::numeric,
               purchase_order_id = $3, updated_at = now(),
               updated_by_user_id = $4
             WHERE id = $5`,
            [input.offerId, offer.rows[0].quotedPrice, existing.rows[0].id,
              input.actorUserId ?? null, input.visitId]
          )
          return { purchaseOrderId: existing.rows[0].id,
            orderNumber: existing.rows[0].orderNumber,
            alreadyIssued: existing.rows[0].issuanceState === "issued" }
        }
        const orderNumber = await nextDocumentNumber(client, {
          counterKey: "PURCHASE_ORDER",
          organizationId: input.organizationId,
          prefix: "STR-PO",
        })
        const order = await client.query<{ id: string }>(
          `INSERT INTO store.purchase_orders (
             organization_id, order_number, supplier_id, order_date,
             order_type, origin_store_id, repair_asset_id, service_description,
             service_price, remark, issuance_id, issuance_fingerprint,
             issuance_state, created_by_user_id, updated_by_user_id
           ) VALUES ($1, $2, $3,
             COALESCE(NULLIF($4, '')::date, current_date),
             'REPAIR', $5, $6, $7, $8::numeric, $9, $10::uuid, $11,
             'pending', $12, $12)
           RETURNING id`,
          [input.organizationId, orderNumber, offer.rows[0].supplierId,
            input.orderDate ?? null, input.accountableStoreId,
            row.assetId, `Calibration: ${row.scope}`, offer.rows[0].quotedPrice,
            input.remark?.trim() || `Calibration visit ${input.visitId}`,
            input.visitId, fingerprint, input.actorUserId ?? null]
        )
        await client.query(
          `UPDATE store.calibration_visits
           SET selected_offer_id = $1, agreed_price = $2::numeric,
             purchase_order_id = $3, updated_at = now(),
             updated_by_user_id = $4
           WHERE id = $5`,
          [input.offerId, offer.rows[0].quotedPrice, order.rows[0]!.id,
            input.actorUserId ?? null, input.visitId]
        )
        return { purchaseOrderId: order.rows[0]!.id, orderNumber,
          alreadyIssued: false }
      })
      const document = await withTransaction(pool, (client) =>
        getStorePurchaseOrderWithClient(client, {
          organizationId: input.organizationId,
          purchaseOrderId: prepared.purchaseOrderId,
        }, { includePending: true })
      )
      if (!document) throw new Error("Calibration service PO was not found.")
      return { ...prepared, document }
    },

    async issueCalibrationServiceOrder(input: Actor & {
      accountableStoreId: string
      visitId: string
    }) {
      return withTransaction(pool, async (client) => {
        const order = await client.query<{
          id: string
          issuanceState: string
          originStoreId: string
          status: string
        }>(
          `SELECT purchase_order.id, purchase_order.status,
             purchase_order.issuance_state AS "issuanceState",
             purchase_order.origin_store_id AS "originStoreId"
           FROM store.calibration_visits visit
           JOIN store.assets asset ON asset.id = visit.asset_id
           JOIN store.purchase_orders purchase_order
             ON purchase_order.id = visit.purchase_order_id
           WHERE visit.id = $1 AND visit.organization_id = $2
             AND visit.method = 'SUPPLIER' AND visit.status = 'OPEN'
             AND asset.accountable_store_id = $3
           FOR UPDATE OF visit, asset, purchase_order`,
          [input.visitId, input.organizationId, input.accountableStoreId]
        )
        const row = order.rows[0]
        if (!row || row.status !== "Open" ||
          row.originStoreId !== input.accountableStoreId) {
          throw new Error("Open calibration service PO was not found in this accountable store.")
        }
        if (row.issuanceState === "issued") return { purchaseOrderId: row.id }
        if (!(await hasIssuedStorePurchaseOrderPdf(client, {
          organizationId: input.organizationId,
          purchaseOrderId: row.id,
        }))) {
          throw new Error("Store the calibration service PO PDF before issue.")
        }
        await client.query(
          `UPDATE store.purchase_orders
           SET issuance_state = 'issued', issued_at = now(),
             updated_at = now(), updated_by_user_id = $2
           WHERE id = $1`,
          [row.id, input.actorUserId ?? null]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return { purchaseOrderId: row.id }
      })
    },

    async finalizeCalibrationDispatch(input: Actor & {
      movedBy?: string | null
      visitId: string
    }) {
      return withTransaction(pool, async (client) => {
        await lockToolingAllocation(client, input.organizationId)
        const visit = await client.query<{
          agreedPrice: string | null
          assetCode: string
          assetId: string
          accountableStoreId: string
          currentHolderName: string | null
          currentHolderReference: string | null
          currentHolderType: string
          itemTypeId: string
          purchaseOrderId: string | null
          selectedOfferId: string | null
          status: VisitStatus
          unitStatus: string
        }>(
          `SELECT visit.asset_id AS "assetId", visit.status,
             visit.selected_offer_id AS "selectedOfferId",
             visit.purchase_order_id AS "purchaseOrderId",
             visit.agreed_price::text AS "agreedPrice",
             asset.asset_code AS "assetCode", asset.item_type_id AS "itemTypeId",
             asset.accountable_store_id AS "accountableStoreId",
             asset.status AS "unitStatus",
             asset.current_holder_type AS "currentHolderType",
             asset.current_holder_reference AS "currentHolderReference",
             asset.current_holder_name AS "currentHolderName"
           FROM store.calibration_visits visit
           JOIN store.assets asset ON asset.id = visit.asset_id
           WHERE visit.id = $1 AND visit.organization_id = $2
           FOR UPDATE OF visit, asset`,
          [input.visitId, input.organizationId]
        )
        const row = visit.rows[0]
        if (!row) throw new Error("Calibration visit was not found.")
        if (row.status === "DISPATCHED") {
          const existing = await client.query<{ id: string }>(
            `SELECT id FROM store.purchase_orders
             WHERE organization_id = $1 AND id = $2
               AND issuance_state = 'issued'`,
            [input.organizationId, row.purchaseOrderId]
          )
          if (existing.rows[0]) return { purchaseOrderId: existing.rows[0].id }
        }
        if (row.status !== "OPEN" || !row.selectedOfferId ||
          !row.agreedPrice || !row.purchaseOrderId) {
          throw new Error("A selected offer is required before calibration dispatch.")
        }
        if (["BROKEN", "SCRAPPED"].includes(row.unitStatus) ||
          row.currentHolderType === "SUPPLIER") {
          throw new Error("This Unit ID cannot be dispatched for calibration.")
        }
        const offer = await client.query<{
          code: string
          name: string
          supplierId: string
        }>(
          `SELECT supplier.id AS "supplierId", supplier.code, supplier.name
           FROM store.calibration_offers offer
           JOIN store.suppliers supplier ON supplier.id = offer.supplier_id
           WHERE offer.id = $1 AND offer.visit_id = $2
             AND offer.organization_id = $3 AND supplier.organization_id = $3`,
          [row.selectedOfferId, input.visitId, input.organizationId]
        )
        if (!offer.rows[0]) throw new Error("Selected calibration offer was not found.")
        const order = await client.query<{
          id: string
          issuanceState: string
          orderNumber: string
          originStoreId: string
          repairAssetId: string
          remark: string | null
          servicePrice: string
          status: string
          supplierId: string
        }>(
          `SELECT id, issuance_state AS "issuanceState",
             order_number AS "orderNumber", status, remark,
             origin_store_id AS "originStoreId",
             repair_asset_id AS "repairAssetId",
             supplier_id AS "supplierId", service_price::text AS "servicePrice"
           FROM store.purchase_orders
           WHERE organization_id = $1 AND id = $2
             AND order_type = 'REPAIR'
           FOR UPDATE`,
          [input.organizationId, row.purchaseOrderId]
        )
        const purchaseOrder = order.rows[0]
        if (!purchaseOrder || purchaseOrder.status !== "Open" ||
          purchaseOrder.repairAssetId !== row.assetId ||
          purchaseOrder.originStoreId !== row.accountableStoreId ||
          purchaseOrder.supplierId !== offer.rows[0].supplierId ||
          Number(row.agreedPrice) > Number(purchaseOrder.servicePrice)) {
          throw new Error("Calibration service PO does not match the selected offer.")
        }
        if (purchaseOrder.issuanceState !== "issued") {
          throw new Error("Issue the calibration service PO before dispatch.")
        }
        if (!(await hasIssuedStorePurchaseOrderPdf(client, {
          organizationId: input.organizationId,
          purchaseOrderId: purchaseOrder.id,
        }))) {
          throw new Error("Store the calibration service PO PDF before dispatch.")
        }
        const location = await client.query<{ id: string }>(
          `SELECT location.id
           FROM store.accountable_stores accountable
           JOIN store.locations location
             ON location.id = accountable.default_location_id
           WHERE accountable.id = $1 AND accountable.organization_id = $2
             AND location.accountable_store_id = accountable.id
             AND location.active AND location.location_type = 'STORE'`,
          [purchaseOrder.originStoreId, input.organizationId]
        )
        const locationId = location.rows[0]?.id
        if (!locationId) throw new Error("The accountable store needs an active location.")
        await client.query(
          `UPDATE store.assets
           SET status = 'UNDER_MAINTENANCE', current_holder_type = 'SUPPLIER',
             current_holder_reference = $1, current_holder_name = $2,
             current_supplier_id = $3, current_vendor_id = NULL,
             current_machine_id = NULL, current_location_id = NULL,
             updated_at = now(), updated_by_user_id = $4
           WHERE id = $5`,
          [offer.rows[0].code, offer.rows[0].name, offer.rows[0].supplierId,
            input.actorUserId ?? null, row.assetId]
        )
        const movement = await client.query<{ id: string }>(
          `INSERT INTO store.stock_movements (
             organization_id, item_type_id, asset_id, location_id,
             movement_type, quantity, from_holder_type,
             from_holder_reference, from_holder_name,
             to_holder_type, to_holder_reference, to_holder_name,
             moved_by, remark, created_by_user_id
           ) VALUES ($1, $2, $3, $4, 'TRANSFER_OUT', -1,
             $5, $6, $7, 'SUPPLIER', $8, $9, $10, $11, $12)
           RETURNING id`,
          [input.organizationId, row.itemTypeId, row.assetId, locationId,
            row.currentHolderType, row.currentHolderReference, row.currentHolderName,
            offer.rows[0].code, offer.rows[0].name, input.movedBy?.trim() || null,
            purchaseOrder.remark ?? `Calibration dispatch under ${purchaseOrder.orderNumber}.`,
            input.actorUserId ?? null]
        )
        await client.query(
          `UPDATE store.calibration_visits
           SET status = 'DISPATCHED', purchase_order_id = $2,
             outbound_movement_id = $3, updated_at = now(),
             updated_by_user_id = $4
           WHERE id = $1`,
          [input.visitId, purchaseOrder.id, movement.rows[0]!.id,
            input.actorUserId ?? null]
        )
        await assertToolingTransferAvailable(client, input.organizationId, row.assetCode)
        await queueDashboardRefresh(client, input.organizationId)
        return { purchaseOrderId: purchaseOrder.id }
      })
    },

    async returnCalibrationVisit(input: Actor & {
      locationId?: string | null
      movedBy?: string | null
      remark?: string | null
      returnedOn?: string | null
      visitId: string
    }) {
      return withTransaction(pool, async (client) => {
        await lockToolingAllocation(client, input.organizationId)
        const visit = await client.query<{
          assetCode: string
          assetId: string
          currentHolderName: string | null
          currentHolderReference: string | null
          currentHolderType: string
          currentSupplierId: string | null
          itemTypeId: string
          accountableStoreId: string
          outboundMovementId: string
          purchaseOrderId: string
          status: VisitStatus
        }>(
          `SELECT visit.asset_id AS "assetId", visit.status,
             visit.outbound_movement_id AS "outboundMovementId",
             visit.purchase_order_id AS "purchaseOrderId",
             asset.asset_code AS "assetCode", asset.item_type_id AS "itemTypeId",
             asset.current_holder_type AS "currentHolderType",
             asset.current_holder_reference AS "currentHolderReference",
             asset.current_holder_name AS "currentHolderName",
             asset.current_supplier_id AS "currentSupplierId",
             asset.accountable_store_id AS "accountableStoreId"
           FROM store.calibration_visits visit
           JOIN store.assets asset ON asset.id = visit.asset_id
           WHERE visit.id = $1 AND visit.organization_id = $2
           FOR UPDATE OF visit, asset`,
          [input.visitId, input.organizationId]
        )
        const row = visit.rows[0]
        if (!row || row.status !== "DISPATCHED") {
          throw new Error("Dispatched calibration visit was not found.")
        }
        const order = await client.query<{ originStoreId: string; supplierId: string }>(
          `SELECT supplier_id AS "supplierId",
             origin_store_id AS "originStoreId" FROM store.purchase_orders
           WHERE id = $1 AND organization_id = $2
             AND repair_asset_id = $3 AND issuance_state = 'issued'
           FOR UPDATE`,
          [row.purchaseOrderId, input.organizationId, row.assetId]
        )
        if (!order.rows[0] ||
          order.rows[0].originStoreId !== row.accountableStoreId ||
          row.currentHolderType !== "SUPPLIER" ||
          row.currentSupplierId !== order.rows[0].supplierId) {
          throw new Error("Unit ID is not held by the selected calibration Supplier.")
        }
        const location = await client.query<{ code: string; id: string; name: string }>(
          `SELECT location.id, location.code, location.name
           FROM store.accountable_stores accountable
           JOIN store.locations location ON location.id = COALESCE(
             $1::uuid, accountable.default_location_id)
           WHERE accountable.id = $3 AND accountable.organization_id = $2
             AND location.organization_id = $2
             AND location.location_type = 'STORE' AND location.active
             AND location.accountable_store_id = accountable.id`,
          [input.locationId ?? null, input.organizationId,
            order.rows[0].originStoreId]
        )
        if (!location.rows[0]) {
          throw new Error("Select an active location in the originating accountable store.")
        }
        const returnDate = await client.query<{ returnAt: Date; valid: boolean }>(
          `WITH requested AS (
             SELECT COALESCE(NULLIF($1, '')::date,
               (now() AT TIME ZONE 'Asia/Kolkata')::date) AS local_date
           ), stamped AS (
             SELECT CASE
               WHEN local_date = (now() AT TIME ZONE 'Asia/Kolkata')::date
                 THEN now()
               ELSE (local_date + time '23:59:59.999999')
                 AT TIME ZONE 'Asia/Kolkata'
             END AS return_at
             FROM requested
           )
           SELECT stamped.return_at AS "returnAt",
             stamped.return_at > movement.moved_at
               AND stamped.return_at <= now() AS valid
           FROM store.stock_movements movement CROSS JOIN stamped
           WHERE movement.id = $2 AND movement.organization_id = $3`,
          [input.returnedOn ?? null, row.outboundMovementId, input.organizationId]
        )
        if (!returnDate.rows[0]?.valid) {
          throw new Error("Return time must be after dispatch and no later than now.")
        }
        await client.query(
          `UPDATE store.assets
           SET status = 'UNDER_MAINTENANCE', current_holder_type = 'STORE',
             current_holder_reference = $1, current_holder_name = $2,
             current_location_id = $3, current_supplier_id = NULL,
             current_vendor_id = NULL, current_machine_id = NULL,
             updated_at = now(), updated_by_user_id = $4
           WHERE id = $5`,
          [location.rows[0].code, location.rows[0].name, location.rows[0].id,
            input.actorUserId ?? null, row.assetId]
        )
        const movement = await client.query<{ id: string }>(
          `INSERT INTO store.stock_movements (
             organization_id, item_type_id, asset_id, location_id,
             movement_type, quantity, from_holder_type,
             from_holder_reference, from_holder_name,
             to_holder_type, to_holder_reference, to_holder_name,
             moved_at, moved_by, remark, created_by_user_id
           ) VALUES ($1, $2, $3, $4, 'RETURN', 1,
             $5, $6, $7, 'STORE', $8, $9,
             $10::timestamptz,
             $11, $12, $13)
           RETURNING id`,
          [input.organizationId, row.itemTypeId, row.assetId, location.rows[0].id,
            row.currentHolderType, row.currentHolderReference, row.currentHolderName,
            location.rows[0].code, location.rows[0].name,
            returnDate.rows[0].returnAt, input.movedBy?.trim() || null,
            input.remark?.trim() || "Returned from calibration Supplier.",
            input.actorUserId ?? null]
        )
        await client.query(
          `UPDATE store.calibration_visits
           SET status = 'RETURNED', return_movement_id = $2,
             updated_at = now(), updated_by_user_id = $3
           WHERE id = $1`,
          [input.visitId, movement.rows[0]!.id, input.actorUserId ?? null]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return { movementId: movement.rows[0]!.id }
      })
    },

    async setCalibrationCertificate(input: Actor & { fileId: string; visitId: string }) {
      return withTransaction(pool, async (client) => {
        const visit = await client.query<{ id: string }>(
          `SELECT id FROM store.calibration_visits
           WHERE id = $1 AND organization_id = $2
             AND (status = 'RETURNED' OR (status = 'OPEN' AND method = 'IN_HOUSE'))
           FOR UPDATE`,
          [input.visitId, input.organizationId]
        )
        if (!visit.rows[0]) throw new Error("Returned calibration visit was not found.")
        await linkedFile(client, {
          fileId: input.fileId,
          organizationId: input.organizationId,
          purpose: "calibration_certificate",
          targetId: input.visitId,
          targetTable: "calibration_visits",
        })
        await client.query(
          `UPDATE store.calibration_visits
           SET certificate_file_id = $1, updated_at = now(),
             updated_by_user_id = $2 WHERE id = $3`,
          [input.fileId, input.actorUserId ?? null, input.visitId]
        )
      })
    },

    async setCalibrationOfferQuote(input: Actor & {
      accountableStoreId: string
      fileId: string
      offerId: string
    }) {
      return withTransaction(pool, async (client) => {
        const offer = await client.query<{ id: string }>(
          `SELECT offer.id FROM store.calibration_offers offer
           JOIN store.calibration_visits visit ON visit.id = offer.visit_id
           JOIN store.assets asset ON asset.id = visit.asset_id
           WHERE offer.id = $1 AND offer.organization_id = $2
             AND visit.organization_id = $2
             AND asset.accountable_store_id = $3
           FOR UPDATE OF offer`,
          [input.offerId, input.organizationId, input.accountableStoreId]
        )
        if (!offer.rows[0]) throw new Error("Calibration Supplier offer was not found.")
        await linkedFile(client, {
          fileId: input.fileId,
          organizationId: input.organizationId,
          purpose: "calibration_quote",
          targetId: input.offerId,
          targetTable: "calibration_offers",
        })
        await client.query(
          `UPDATE store.calibration_offers SET quote_file_id = $1 WHERE id = $2`,
          [input.fileId, input.offerId]
        )
      })
    },

    async completeInHouseCalibrationVisit(input: Actor & {
      certificateNumber: string
      completedBy: string
      completedOn: string
      passed: boolean
      scope?: string | null
      visitId: string
      workDone?: string | null
    }) {
      return withTransaction(pool, async (client) => {
        const visit = await client.query<{
          assetId: string
          certificateFileId: string | null
          scheduleId: string
          status: VisitStatus
          unitStatus: string
          holderType: string
        }>(
          `SELECT visit.asset_id AS "assetId", visit.schedule_id AS "scheduleId",
             visit.certificate_file_id AS "certificateFileId", visit.status,
             asset.status AS "unitStatus",
             asset.current_holder_type AS "holderType"
           FROM store.calibration_visits visit
           JOIN store.assets asset ON asset.id = visit.asset_id
           WHERE visit.id = $1 AND visit.organization_id = $2
             AND visit.method = 'IN_HOUSE'
           FOR UPDATE OF visit, asset`,
          [input.visitId, input.organizationId]
        )
        const row = visit.rows[0]
        if (!row || row.status !== "OPEN") {
          throw new Error("Open in-house calibration visit was not found.")
        }
        if (row.unitStatus === "BROKEN" || row.unitStatus === "SCRAPPED" ||
          !["STORE", "MACHINE", "DEPARTMENT"].includes(row.holderType)) {
          throw new Error("This Unit ID is not available for in-house calibration.")
        }
        if (!row.certificateFileId) {
          throw new Error("Upload the calibration certificate before completion.")
        }
        await linkedFile(client, {
          fileId: row.certificateFileId,
          organizationId: input.organizationId,
          purpose: "calibration_certificate",
          targetId: input.visitId,
          targetTable: "calibration_visits",
        })
        const schedule = await client.query<{ frequencyDays: number }>(
          `SELECT COALESCE(definition.frequency_value, schedule.frequency_days)
             AS "frequencyDays"
           FROM store.asset_maintenance_schedules schedule
           LEFT JOIN maintenance.definitions definition ON definition.id = schedule.definition_id
           WHERE schedule.id = $1 AND schedule.organization_id = $2
             AND schedule.asset_id = $3 AND schedule.schedule_type = 'CALIBRATION'
             AND schedule.active
           FOR UPDATE OF schedule`,
          [row.scheduleId, input.organizationId, row.assetId]
        )
        if (!schedule.rows[0] || !Number.isInteger(schedule.rows[0].frequencyDays)) {
          throw new Error("Active calibration timetable was not found.")
        }
        const completedOn = required(input.completedOn, "Completed date")
        const validDate = await client.query<{ valid: boolean }>(
          `SELECT $1::date <= (now() AT TIME ZONE 'Asia/Kolkata')::date AS valid`,
          [completedOn]
        )
        if (!validDate.rows[0]?.valid) throw new Error("Completed date cannot be in the future.")
        const nextDueOn = input.passed
          ? (await client.query<{ nextDueOn: string }>(
              `SELECT ($1::date + $2::integer)::text AS "nextDueOn"`,
              [completedOn, schedule.rows[0].frequencyDays]
            )).rows[0]!.nextDueOn
          : null
        const openRepair = input.passed ? await client.query<{ id: string }>(
          `SELECT repair_item.id
           FROM store.repair_purchase_order_items repair_item
           JOIN store.purchase_orders purchase_order
             ON purchase_order.id = repair_item.purchase_order_id
           WHERE repair_item.organization_id = $1
             AND repair_item.asset_id = $2
             AND repair_item.status = 'Open'
             AND purchase_order.status = 'Open'
           LIMIT 1`,
          [input.organizationId, row.assetId]
        ) : null
        if (openRepair?.rows[0]) {
          throw new Error("Complete the open service PO before in-house sign-off.")
        }
        const openBreakdown = input.passed ? await client.query<{ id: string }>(
          `SELECT id FROM store.asset_breakdowns
           WHERE organization_id = $1 AND asset_id = $2
             AND status = 'In Progress' LIMIT 1`,
          [input.organizationId, row.assetId]
        ) : null
        const record = await client.query<{ id: string }>(
          `INSERT INTO store.asset_maintenance_records (
             organization_id, asset_id, schedule_id, maintenance_type,
             completed_on, completed_by, certificate_number, work_done,
             result, next_due_on, created_by_user_id
           ) VALUES ($1, $2, $3, 'CALIBRATION', $4::date, $5, $6,
             $7, $8, $9::date, $10) RETURNING id`,
          [input.organizationId, row.assetId, row.scheduleId, completedOn,
            required(input.completedBy, "Completed by"),
            required(input.certificateNumber, "Certificate number"),
            input.workDone?.trim() || null, input.passed ? "PASSED" : "FAILED",
            nextDueOn, input.actorUserId ?? null]
        )
        await client.query(
          `UPDATE store.calibration_visits
           SET status = $2, maintenance_record_id = $3,
             scope = COALESCE(NULLIF(btrim($5::text), ''), scope),
             updated_at = now(), updated_by_user_id = $4 WHERE id = $1`,
          [input.visitId, input.passed ? "PASSED" : "FAILED",
            record.rows[0]!.id, input.actorUserId ?? null,
            input.scope ?? null]
        )
        if (input.passed) {
          await client.query(
            `UPDATE store.asset_maintenance_schedules
             SET last_completed_on = $1::date, next_due_on = $2::date,
               updated_at = now(), updated_by_user_id = $3 WHERE id = $4`,
            [completedOn, nextDueOn, input.actorUserId ?? null, row.scheduleId]
          )
          const unresolvedFailure = await hasUnresolvedCalibrationFailure(
            client, input.organizationId, row.assetId
          )
          await client.query(
            `UPDATE store.assets SET status = $2,
               updated_at = now(), updated_by_user_id = $3 WHERE id = $1`,
            [row.assetId, openBreakdown?.rows[0] ? "BROKEN" :
              unresolvedFailure ? "UNDER_MAINTENANCE" :
              row.holderType === "STORE" ? "AVAILABLE" : "ASSIGNED",
              input.actorUserId ?? null]
          )
        } else {
          await client.query(
            `UPDATE store.assets SET status = 'UNDER_MAINTENANCE',
               updated_at = now(), updated_by_user_id = $2 WHERE id = $1`,
            [row.assetId, input.actorUserId ?? null]
          )
        }
        await queueDashboardRefresh(client, input.organizationId)
        return { maintenanceRecordId: record.rows[0]!.id, nextDueOn }
      })
    },

    async completeCalibrationVisit(input: Actor & {
      certificateNumber?: string | null
      completedBy: string
      completedOn: string
      passed: boolean
      result: string
      visitId: string
      workDone?: string | null
    }) {
      return withTransaction(pool, async (client) => {
        const visit = await client.query<{
          agreedPrice: string
          assetId: string
          certificateFileId: string | null
          currentHolderType: string
          dispatchedDate: string
          purchaseOrderId: string
          scheduleId: string
          status: VisitStatus
          supplierName: string
          unitStatus: string
        }>(
          `SELECT visit.asset_id AS "assetId", visit.status,
             visit.schedule_id AS "scheduleId",
             visit.purchase_order_id AS "purchaseOrderId",
             visit.certificate_file_id AS "certificateFileId",
             visit.agreed_price::text AS "agreedPrice",
             (outbound.moved_at AT TIME ZONE 'Asia/Kolkata')::date::text
               AS "dispatchedDate",
             supplier.name AS "supplierName",
             asset.current_holder_type AS "currentHolderType",
             asset.status AS "unitStatus"
           FROM store.calibration_visits visit
           JOIN store.assets asset ON asset.id = visit.asset_id
           JOIN store.calibration_offers offer ON offer.id = visit.selected_offer_id
           JOIN store.stock_movements outbound ON outbound.id = visit.outbound_movement_id
           JOIN store.suppliers supplier ON supplier.id = offer.supplier_id
           WHERE visit.id = $1 AND visit.organization_id = $2
           FOR UPDATE OF visit, asset`,
          [input.visitId, input.organizationId]
        )
        const row = visit.rows[0]
        if (!row || row.status !== "RETURNED") {
          throw new Error("Returned calibration visit was not found.")
        }
        if (row.currentHolderType !== "STORE" || row.unitStatus !== "UNDER_MAINTENANCE") {
          throw new Error("Return the Unit ID to Store before recording the calibration result.")
        }
        if (!row.certificateFileId) {
          throw new Error("Upload the calibration certificate before completion.")
        }
        await linkedFile(client, {
          fileId: row.certificateFileId,
          organizationId: input.organizationId,
          purpose: "calibration_certificate",
          targetId: input.visitId,
          targetTable: "calibration_visits",
        })
        const schedule = await client.query<{ frequencyDays: number }>(
          `SELECT COALESCE(definition.frequency_value, schedule.frequency_days)
             AS "frequencyDays"
           FROM store.asset_maintenance_schedules schedule
           LEFT JOIN maintenance.definitions definition ON definition.id = schedule.definition_id
           WHERE schedule.id = $1 AND schedule.organization_id = $2
             AND schedule.asset_id = $3 AND schedule.schedule_type = 'CALIBRATION'
             AND schedule.active
           FOR UPDATE OF schedule`,
          [row.scheduleId, input.organizationId, row.assetId]
        )
        if (!schedule.rows[0] || !Number.isInteger(schedule.rows[0].frequencyDays)) {
          throw new Error("Active calibration timetable was not found.")
        }
        const completedOn = required(input.completedOn, "Completed date")
        const completedDate = await client.query<{ valid: boolean }>(
          `SELECT $1::date BETWEEN $2::date
             AND (now() AT TIME ZONE 'Asia/Kolkata')::date AS valid`,
          [completedOn, row.dispatchedDate]
        )
        if (!completedDate.rows[0]?.valid) {
          throw new Error("Completed date must be between dispatch and today.")
        }
        const nextDueOn = input.passed
          ? (await client.query<{ nextDueOn: string }>(
              `SELECT ($1::date + $2::integer)::text AS "nextDueOn"`,
              [completedOn, schedule.rows[0].frequencyDays]
            )).rows[0]!.nextDueOn
          : null
        const record = await client.query<{ id: string }>(
          `INSERT INTO store.asset_maintenance_records (
             organization_id, asset_id, schedule_id, maintenance_type,
             completed_on, completed_by, supplier_name, certificate_number,
             work_done, result, cost, next_due_on, created_by_user_id
           ) VALUES ($1, $2, $3, 'CALIBRATION', $4::date, $5, $6, $7,
             $8, $9, $10::numeric, $11::date, $12)
           RETURNING id`,
          [input.organizationId, row.assetId, row.scheduleId, completedOn,
            required(input.completedBy, "Completed by"), row.supplierName,
            input.certificateNumber?.trim() || null,
            input.workDone?.trim() || null, required(input.result, "Result"),
            row.agreedPrice, nextDueOn, input.actorUserId ?? null]
        )
        await client.query(
          `UPDATE store.calibration_visits
           SET status = $2, maintenance_record_id = $3,
             updated_at = now(), updated_by_user_id = $4
           WHERE id = $1`,
          [input.visitId, input.passed ? "PASSED" : "FAILED",
            record.rows[0]!.id, input.actorUserId ?? null]
        )
        if (input.passed) {
          await client.query(
            `UPDATE store.asset_maintenance_schedules
             SET last_completed_on = $1::date, next_due_on = $2::date,
               updated_at = now(), updated_by_user_id = $3
             WHERE id = $4`,
            [completedOn, nextDueOn, input.actorUserId ?? null, row.scheduleId]
          )
          const openBreakdown = await client.query<{ id: string }>(
            `SELECT id FROM store.asset_breakdowns
             WHERE organization_id = $1 AND asset_id = $2
               AND status = 'In Progress' LIMIT 1`,
            [input.organizationId, row.assetId]
          )
          const unresolvedFailure = await hasUnresolvedCalibrationFailure(
            client, input.organizationId, row.assetId
          )
          await client.query(
            `UPDATE store.assets SET status = $2, updated_at = now(),
               updated_by_user_id = $3 WHERE id = $1`,
            [row.assetId, openBreakdown.rows[0] ? "BROKEN" :
              unresolvedFailure ? "UNDER_MAINTENANCE" : "AVAILABLE",
              input.actorUserId ?? null]
          )
        }
        if (input.passed) {
          const completedOrder = await client.query<{ id: string }>(
            `UPDATE store.purchase_orders
             SET status = 'Completed', updated_at = now(),
               updated_by_user_id = $3
             WHERE id = $1 AND organization_id = $2
               AND issuance_state = 'issued' AND status = 'Open'
             RETURNING id`,
            [row.purchaseOrderId, input.organizationId, input.actorUserId ?? null]
          )
          if (!completedOrder.rows[0]) {
            throw new Error("Open calibration service PO was not found.")
          }
        }
        await queueDashboardRefresh(client, input.organizationId)
        return { maintenanceRecordId: record.rows[0]!.id, nextDueOn }
      })
    },
  }
}
