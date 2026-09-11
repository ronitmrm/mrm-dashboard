export const artifactUploadOffsetHeader = "Upload-Offset"

export type PendingUploadSafeState =
  | "abandoned"
  | "finalized"
  | "ready"
  | "uploading"

export type PendingUploadSafeProgress = {
  confirmedOffset: number
  state: PendingUploadSafeState
  uploadId: string
}

type CommercialDesignPurpose =
  | "cad"
  | "customer_drawing"
  | "customer_marked"
  | "internal_drawing"

export type PendingUploadIntent =
  | {
      enquiryId: string
      enquiryItemId?: string
      kind: "commercial-enquiry-item"
      operation: "create" | "update"
    }
  | {
      clarificationTaskId: string
      enquiryId: string
      enquiryItemId: string
      kind: "commercial-sales-clarification"
    }
  | {
      bomLineNumber?: number
      designId: string
      enquiryId: string
      enquiryItemId: string
      kind: "commercial-design-attachment"
      purpose: CommercialDesignPurpose
    }
  | {
      engineeringChangeNoteId: string
      kind: "commercial-ecn-drawing"
    }
  | { enquiryId: string; kind: "commercial-enquiry-import" }
  | { kind: "commercial-purchase-order-source"; purchaseOrderId: string }
  | { candidateId?: string; kind: "recruitment-candidate-resume" }
  | { index: number; kind: "maintenance-request-photo" }
  | { itemTypeId?: string; kind: "store-item-drawing" }
  | {
      itemTypeId?: string
      kind: "store-supplier-quote"
      supplierId?: string
      supplierPriceId?: string
    }
  | { kind: "store-guarantee-card"; purchaseOrderLineId: string }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Upload intent must be an object.")
  }
  return value as Record<string, unknown>
}

function text(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 255) {
    throw new Error(`Upload intent ${name} is invalid.`)
  }
  return value.trim()
}

function optionalText(value: unknown, name: string) {
  if (value === undefined || value === null || value === "") return undefined
  return text(value, name)
}

export function parsePendingUploadIntent(value: unknown): PendingUploadIntent {
  const input = object(value)
  const kind = text(input.kind, "kind")
  switch (kind) {
    case "commercial-enquiry-item": {
      const operation = text(input.operation, "operation")
      if (operation !== "create" && operation !== "update") {
        throw new Error("Upload intent operation is invalid.")
      }
      const enquiryItemId = optionalText(input.enquiryItemId, "enquiryItemId")
      if (operation === "update" && !enquiryItemId) {
        throw new Error("Upload intent enquiryItemId is required.")
      }
      if (operation === "create" && enquiryItemId) {
        throw new Error("Create upload intent cannot select an enquiry item.")
      }
      return {
        enquiryId: text(input.enquiryId, "enquiryId"),
        ...(enquiryItemId ? { enquiryItemId } : {}),
        kind,
        operation,
      }
    }
    case "commercial-sales-clarification":
      return {
        clarificationTaskId: text(
          input.clarificationTaskId,
          "clarificationTaskId"
        ),
        enquiryId: text(input.enquiryId, "enquiryId"),
        enquiryItemId: text(input.enquiryItemId, "enquiryItemId"),
        kind,
      }
    case "commercial-design-attachment": {
      const purpose = text(input.purpose, "purpose")
      if (
        purpose !== "cad" &&
        purpose !== "customer_drawing" &&
        purpose !== "customer_marked" &&
        purpose !== "internal_drawing"
      ) {
        throw new Error("Upload intent purpose is invalid.")
      }
      const bomLineNumber =
        input.bomLineNumber === undefined
          ? undefined
          : Number(input.bomLineNumber)
      if (
        bomLineNumber !== undefined &&
        (!Number.isSafeInteger(bomLineNumber) || bomLineNumber <= 0)
      ) {
        throw new Error("Upload intent bomLineNumber is invalid.")
      }
      if (purpose === "customer_drawing" && bomLineNumber !== undefined) {
        throw new Error("Customer drawings cannot select a BOM line.")
      }
      return {
        ...(bomLineNumber === undefined ? {} : { bomLineNumber }),
        designId: text(input.designId, "designId"),
        enquiryId: text(input.enquiryId, "enquiryId"),
        enquiryItemId: text(input.enquiryItemId, "enquiryItemId"),
        kind,
        purpose,
      }
    }
    case "commercial-ecn-drawing":
      return {
        engineeringChangeNoteId: text(
          input.engineeringChangeNoteId,
          "engineeringChangeNoteId"
        ),
        kind,
      }
    case "commercial-enquiry-import":
      return { enquiryId: text(input.enquiryId, "enquiryId"), kind }
    case "commercial-purchase-order-source":
      return {
        kind,
        purchaseOrderId: text(input.purchaseOrderId, "purchaseOrderId"),
      }
    case "recruitment-candidate-resume": {
      const candidateId = optionalText(input.candidateId, "candidateId")
      return { ...(candidateId ? { candidateId } : {}), kind }
    }
    case "maintenance-request-photo": {
      const index = Number(input.index)
      if (!Number.isSafeInteger(index) || index < 1 || index > 8) {
        throw new Error("Upload intent photo index is invalid.")
      }
      return { index, kind }
    }
    case "store-item-drawing": {
      const itemTypeId = optionalText(input.itemTypeId, "itemTypeId")
      return { ...(itemTypeId ? { itemTypeId } : {}), kind }
    }
    case "store-supplier-quote": {
      const itemTypeId = optionalText(input.itemTypeId, "itemTypeId")
      const supplierId = optionalText(input.supplierId, "supplierId")
      const supplierPriceId = optionalText(
        input.supplierPriceId,
        "supplierPriceId"
      )
      const creating = itemTypeId && supplierId && !supplierPriceId
      const existing = supplierPriceId && !itemTypeId && !supplierId
      if (!creating && !existing) {
        throw new Error(
          "Supplier quote intent must select a Supplier Price or its create inputs."
        )
      }
      return {
        ...(itemTypeId ? { itemTypeId } : {}),
        kind,
        ...(supplierId ? { supplierId } : {}),
        ...(supplierPriceId ? { supplierPriceId } : {}),
      }
    }
    case "store-guarantee-card":
      return {
        kind,
        purchaseOrderLineId: text(
          input.purchaseOrderLineId,
          "purchaseOrderLineId"
        ),
      }
    default:
      throw new Error("Upload intent kind is unsupported.")
  }
}

export function pendingUploadFieldName(fileFieldName: string) {
  return `${fileFieldName}_upload_id`
}

export function pendingUploadIntentEquals(
  left: PendingUploadIntent,
  right: PendingUploadIntent
) {
  return (
    JSON.stringify(parsePendingUploadIntent(left)) ===
    JSON.stringify(parsePendingUploadIntent(right))
  )
}
