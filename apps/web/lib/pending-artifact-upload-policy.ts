import "server-only"

import path from "node:path"

import {
  authorizeCommercialAttachmentTarget,
  authorizeCommercialOrderArtifactTarget,
  authorizeRecruitmentCandidateArtifactTarget,
  authorizeStoreItemTypeArtifactTarget,
  authorizeStoreSupplierPriceArtifactTarget,
} from "@workspace/db"
import type { PoolClient } from "pg"

import { parseEnquiryImportFile } from "@/app/commercial/enquiries/enquiry-workbook"
import { masterCapability } from "@/lib/auth/master-capabilities"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"
import {
  isStoreActionCapability,
  resolveStoreActionCapabilities,
} from "@/lib/auth/store-action-access"
import {
  commercialAttachmentRequestLimitBytes,
  validateCommercialAttachment,
} from "@/lib/commercial-attachment"
import {
  parsePendingUploadIntent,
  type PendingUploadIntent,
} from "@/lib/artifact-upload-contract"
import { validateUserAttachment } from "@/lib/user-attachment-security"

const tenMiB = 10 * 1024 * 1024
const twentyFiveMiB = 25 * 1024 * 1024

export type PendingUploadAuthorization = {
  grantedCapabilities: ReadonlySet<string>
  userId: string
}

export function normalizePendingUploadMetadata(input: {
  byteSize: unknown
  fileName: unknown
  intent: unknown
  mediaType: unknown
}) {
  const intent = parsePendingUploadIntent(input.intent)
  const byteSize = Number(input.byteSize)
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
    throw new Error("Upload byteSize must be a positive integer.")
  }
  if (byteSize > pendingUploadLimitBytes(intent)) {
    throw new Error("Upload exceeds the size limit for this attachment.")
  }
  if (typeof input.fileName !== "string" || !input.fileName) {
    throw new Error("Upload fileName is required.")
  }
  const fileName = path
    .basename(input.fileName)
    .replace(/[<>:"/\\|?*\r\n]+/g, "_")
  if (!fileName || fileName.length > 255) {
    throw new Error("Upload fileName is invalid.")
  }
  if (typeof input.mediaType !== "string" || input.mediaType.length > 255) {
    throw new Error("Upload mediaType is invalid.")
  }
  return {
    byteSize,
    fileName,
    intent,
    mediaType: input.mediaType,
  }
}

export function pendingUploadLimitBytes(intent: PendingUploadIntent) {
  if (intent.kind === "commercial-enquiry-import") {
    return commercialAttachmentRequestLimitBytes
  }
  if (intent.kind.startsWith("commercial-")) {
    return twentyFiveMiB
  }
  return tenMiB
}

function requireCapability(
  authorization: PendingUploadAuthorization,
  capability: string
) {
  const granted = authorization.grantedCapabilities
  if (granted.has(capability)) return
  if (
    isStoreActionCapability(capability) &&
    resolveStoreActionCapabilities([...granted]).has(capability)
  ) {
    return
  }
  throw new Error("Upload operation is not permitted.")
}

async function organizationForCode(client: PoolClient, code: string) {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM core.organizations WHERE code = $1`,
    [code]
  )
  if (!result.rows[0]) throw new Error("Organization was not found.")
  return result.rows[0].id
}

async function organizationForTarget(
  client: PoolClient,
  sql: string,
  values: unknown[]
) {
  const result = await client.query<{ organization_id: string }>(sql, values)
  if (!result.rows[0]) throw new Error("Upload target was not found.")
  return result.rows[0].organization_id
}

export async function authorizePendingUploadIntent(
  client: PoolClient,
  intent: PendingUploadIntent,
  authorization: PendingUploadAuthorization,
  options: { finalizing?: boolean } = {}
) {
  const actorUserId = authorization.userId
  switch (intent.kind) {
    case "commercial-enquiry-item": {
      requireCapability(
        authorization,
        intent.operation === "create"
          ? commercialTaskCapabilities.addEnquiryItem
          : commercialTaskCapabilities.updateEnquiryItem
      )
      const organizationId = await organizationForTarget(
        client,
        `SELECT organization_id FROM sales.enquiries
         WHERE id = $1 AND (created_by_user_id = $2
           OR (SELECT identity.has_administrative_access($2)))
         FOR KEY SHARE`,
        [intent.enquiryId, actorUserId]
      )
      if (intent.operation === "update") {
        await authorizeCommercialAttachmentTarget(
          client,
          {
            enquiryId: intent.enquiryId,
            enquiryItemId: intent.enquiryItemId!,
            kind: "enquiry_item",
            organizationId,
          },
          { actorUserId, requireOpenState: !options.finalizing }
        )
      }
      return organizationId
    }
    case "commercial-sales-clarification": {
      requireCapability(
        authorization,
        commercialTaskCapabilities.completeSalesClarification
      )
      const organizationId = await organizationForTarget(
        client,
        `SELECT organization_id FROM sales.clarification_tasks WHERE id = $1`,
        [intent.clarificationTaskId]
      )
      await authorizeCommercialAttachmentTarget(
        client,
        { ...intent, kind: "sales_clarification", organizationId },
        { actorUserId, requireOpenState: !options.finalizing }
      )
      return organizationId
    }
    case "commercial-design-attachment": {
      requireCapability(authorization, commercialTaskCapabilities.saveDesign)
      const organizationId = await organizationForTarget(
        client,
        `SELECT organization_id FROM sales.design_tasks WHERE id = $1`,
        [intent.designId]
      )
      await authorizeCommercialAttachmentTarget(
        client,
        { ...intent, kind: "design", organizationId },
        { actorUserId, requireOpenState: !options.finalizing }
      )
      return organizationId
    }
    case "commercial-ecn-drawing": {
      requireCapability(
        authorization,
        commercialTaskCapabilities.completeEngineeringChangeDesign
      )
      const organizationId = await organizationForTarget(
        client,
        `SELECT organization_id FROM sales.engineering_change_notes WHERE id = $1`,
        [intent.engineeringChangeNoteId]
      )
      await authorizeCommercialAttachmentTarget(
        client,
        {
          engineeringChangeNoteId: intent.engineeringChangeNoteId,
          kind: "engineering_change",
          organizationId,
        },
        { requireOpenState: !options.finalizing }
      )
      return organizationId
    }
    case "commercial-enquiry-import": {
      requireCapability(
        authorization,
        commercialTaskCapabilities.importEnquiryLines
      )
      return organizationForTarget(
        client,
        `SELECT organization_id FROM sales.enquiries
         WHERE id = $1 AND (created_by_user_id = $2
           OR (SELECT identity.has_administrative_access($2)))
         FOR KEY SHARE`,
        [intent.enquiryId, actorUserId]
      )
    }
    case "commercial-purchase-order-source": {
      requireCapability(
        authorization,
        commercialTaskCapabilities.uploadPurchaseOrderFile
      )
      const organizationId = await organizationForTarget(
        client,
        `SELECT organization_id FROM sales.purchase_orders WHERE id = $1`,
        [intent.purchaseOrderId]
      )
      await authorizeCommercialOrderArtifactTarget(
        client,
        { organizationId, purchaseOrderId: intent.purchaseOrderId },
        { requireOpenState: !options.finalizing }
      )
      return organizationId
    }
    case "recruitment-candidate-resume": {
      requireCapability(authorization, masterCapability("candidates", "save"))
      const organizationId = await organizationForCode(client, "MRMPL")
      if (intent.candidateId) {
        await authorizeRecruitmentCandidateArtifactTarget(client, {
          candidateId: intent.candidateId,
          organizationId,
        })
      }
      return organizationId
    }
    case "maintenance-request-photo":
      return organizationForCode(client, "MRMPL")
    case "store-item-drawing": {
      requireCapability(authorization, masterCapability("ITEM_TYPE", "save"))
      const organizationId = await organizationForCode(client, "MRMPL")
      if (intent.itemTypeId) {
        await authorizeStoreItemTypeArtifactTarget(client, {
          itemTypeId: intent.itemTypeId,
          organizationId,
        })
      }
      return organizationId
    }
    case "store-supplier-quote": {
      requireCapability(
        authorization,
        masterCapability("SUPPLIER_PRICE", "save")
      )
      const organizationId = await organizationForCode(client, "MRMPL")
      if (intent.supplierPriceId) {
        await authorizeStoreSupplierPriceArtifactTarget(client, {
          organizationId,
          supplierPriceId: intent.supplierPriceId,
        })
      } else {
        await organizationForTarget(
          client,
          `SELECT item.organization_id
           FROM store.item_types item
           JOIN store.suppliers supplier ON supplier.id = $2
             AND supplier.organization_id = item.organization_id
             AND supplier.active
           WHERE item.id = $1 AND item.organization_id = $3 AND item.active`,
          [intent.itemTypeId, intent.supplierId, organizationId]
        )
      }
      return organizationId
    }
    case "store-guarantee-card": {
      requireCapability(authorization, "store.receipts.receive")
      const organizationId = await organizationForCode(client, "MRMPL")
      await organizationForTarget(
        client,
        `SELECT line.organization_id
         FROM store.purchase_order_lines line
         JOIN store.purchase_orders purchase_order
           ON purchase_order.id = line.purchase_order_id
         WHERE line.id = $1 AND line.organization_id = $2
           AND ($3::boolean OR (
             purchase_order.issuance_state = 'issued'
             AND purchase_order.status <> 'Cancelled'
             AND line.received_quantity < line.ordered_quantity
           ))`,
        [
          intent.purchaseOrderLineId,
          organizationId,
          options.finalizing === true,
        ]
      )
      return organizationId
    }
  }
}

export function validatePendingUploadBytes(input: {
  bytes: Buffer
  fileName: string
  intent: PendingUploadIntent
  mediaType: string
}) {
  const { bytes, fileName, intent, mediaType } = input
  if (bytes.byteLength > pendingUploadLimitBytes(intent)) {
    throw new Error("Upload exceeds the size limit for this attachment.")
  }
  switch (intent.kind) {
    case "commercial-enquiry-import": {
      const rows = parseEnquiryImportFile(bytes, fileName)
      if (!rows.length) throw new Error("Template has no line items.")
      return { fileName, mediaType }
    }
    case "commercial-purchase-order-source":
      return validateUserAttachment({
        bytes,
        fileName,
        purpose: "purchase-order",
      })
    case "recruitment-candidate-resume": {
      if (!/\.pdf$/i.test(fileName)) {
        throw new Error("Candidate resume must be a PDF file.")
      }
      if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error("Candidate resume is not a valid PDF file.")
      }
      return { fileName, mediaType: "application/pdf" }
    }
    case "maintenance-request-photo":
      return validateUserAttachment({
        bytes,
        fileName,
        purpose: "maintenance-photo",
      })
    case "store-item-drawing": {
      if (
        !new Set(["application/pdf", "image/jpeg", "image/png"]).has(mediaType)
      ) {
        throw new Error("Asset drawing must be a PDF, JPG, or PNG file.")
      }
      return validateUserAttachment({ bytes, fileName, purpose: "drawing" })
    }
    case "store-supplier-quote":
      return {
        ...validateUserAttachment({
          bytes,
          fileName,
          purpose: "supplier-quote",
        }),
        mediaType: "application/pdf",
      }
    case "store-guarantee-card": {
      if (
        !new Set(["application/pdf", "image/jpeg", "image/png"]).has(mediaType)
      ) {
        throw new Error("Guarantee card must be a PDF, JPG, or PNG file.")
      }
      return validateUserAttachment({
        bytes,
        fileName,
        purpose: "purchase-order",
      })
    }
    default:
      return validateCommercialAttachment({
        bytes,
        declaredMediaType: mediaType,
        fileName,
        purpose:
          intent.kind === "commercial-sales-clarification"
            ? "sales_clarification"
            : intent.kind === "commercial-design-attachment"
              ? intent.purpose
              : "drawing",
      })
  }
}
