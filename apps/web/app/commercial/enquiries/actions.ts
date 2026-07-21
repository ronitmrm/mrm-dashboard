"use server"

import { createHash, randomUUID } from "node:crypto"
import { mkdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

import { createCommercialWorkflowRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

const enquiriesPath = "/commercial/enquiries"

function requiredText(formData: FormData, name: string) {
  const value = formData.get(name)
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`)
  }
  return value.trim()
}

function optionalText(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function numeric(formData: FormData, name: string, fallback = 0) {
  const raw = optionalText(formData, name)
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`)
  }
  return value
}

async function withWorkflow<T>(
  capability: string,
  returnPath: string,
  operation: (
    workflow: ReturnType<typeof createCommercialWorkflowRepository>,
    actorUserId: string
  ) => Promise<T>
) {
  const session = await requireCapability(capability, returnPath)
  const workflow = createCommercialWorkflowRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    return await operation(workflow, session.user.id)
  } finally {
    await workflow.close()
  }
}

function safeFileName(fileName: string) {
  return fileName.replace(/[<>:"/\\|?*]+/g, "_")
}

async function persistAttachment(
  file: File,
  input: {
    enquiryId: string
    enquiryItemId: string
    organizationId: string
  }
) {
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Drawing files must not exceed 25 MB.")
  }
  const fileName = safeFileName(file.name)
  if (!fileName || fileName === "." || fileName === "..") {
    throw new Error("Drawing file name is invalid.")
  }
  const bytes = Buffer.from(await file.arrayBuffer())
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const sourceId = randomUUID()
  const storageKey = path.posix.join(
    "attachments",
    input.enquiryId,
    input.enquiryItemId,
    sourceId,
    fileName
  )
  const storageRoot =
    process.env.LOCAL_FILE_STORAGE_PATH ??
    path.join(/*turbopackIgnore: true*/ process.cwd(), "local-data")
  const filePath = path.join(
    /*turbopackIgnore: true*/ storageRoot,
    ...storageKey.split("/"),
  )
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, bytes, { flag: "wx" })
  try {
    await withWorkflow(
      "pricing.enquiries.write",
      `${enquiriesPath}/${input.enquiryId}`,
      (workflow) =>
        workflow.recordAttachment({
          byteSize: bytes.byteLength,
          fileName,
          mediaType: file.type || null,
          organizationId: input.organizationId,
          sha256,
          sourceId,
          storageKey,
          targetId: input.enquiryItemId,
        })
    )
  } catch (error) {
    await unlink(filePath).catch(() => undefined)
    throw error
  }
}

export async function createEnquiryAction(formData: FormData) {
  const enquiry = await withWorkflow(
    "pricing.enquiries.write",
    enquiriesPath,
    (workflow, actorUserId) =>
      workflow.createEnquiry({
        actorUserId,
        buyerName: optionalText(formData, "buyer_name"),
        commercialTerms: {
          conversionRate: numeric(formData, "conversion_rate", 1),
          currency: requiredText(formData, "currency"),
          incoterms: optionalText(formData, "incoterms"),
          packagingTerms: optionalText(formData, "packaging_terms"),
          paymentTerms: optionalText(formData, "payment_terms"),
          shipmentMode: optionalText(formData, "shipment_mode"),
        },
        customerId: requiredText(formData, "customer_id"),
        organizationId: requiredText(formData, "organization_id"),
        priority: requiredText(formData, "priority"),
        receivedOn: requiredText(formData, "received_on"),
        remarks: optionalText(formData, "remarks"),
        source: requiredText(formData, "source"),
      })
  )
  revalidatePath(enquiriesPath)
  redirect(`${enquiriesPath}/${enquiry.id}`)
}

export async function addEnquiryItemAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  const organizationId = requiredText(formData, "organization_id")
  const line = await withWorkflow(
    "pricing.enquiries.write",
    `${enquiriesPath}/${enquiryId}`,
    (workflow, actorUserId) =>
      workflow.addEnquiryItem({
        actorUserId,
        customerPartCode: requiredText(formData, "part"),
        description: requiredText(formData, "description"),
        drawingReference: optionalText(formData, "drawing_reference"),
        enquiryId,
        grade: optionalText(formData, "grade"),
        organizationId,
        quantity: numeric(formData, "quantity"),
        remarks: optionalText(formData, "remarks"),
        targetPrice: numeric(formData, "target_price"),
      })
  )
  const drawing = formData.get("drawing_file")
  if (drawing instanceof File && drawing.size > 0) {
    await persistAttachment(drawing, {
      enquiryId,
      enquiryItemId: line.id,
      organizationId,
    })
  }
  revalidatePath(enquiriesPath)
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
  redirect(`${enquiriesPath}/${enquiryId}`)
}

export async function handOverEnquiryAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  await withWorkflow(
    "pricing.enquiries.write",
    `${enquiriesPath}/${enquiryId}`,
    (workflow, actorUserId) =>
      workflow.handOverToTechnicalReview(enquiryId, actorUserId)
  )
  revalidatePath(enquiriesPath)
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
}

export async function updateTechnicalReviewAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  const checklistKeys = [
    "drawing_available",
    "grade_material_clear",
    "drawing_information_complete",
    "finish_plating_clear",
    "packaging_clear",
    "tooling_process_feasible",
  ]
  await withWorkflow(
    "pricing.technical_review.write",
    `${enquiriesPath}/${enquiryId}`,
    (workflow, actorUserId) =>
      workflow.updateTechnicalReview({
        actorUserId,
        checklist: Object.fromEntries(
          checklistKeys.map((key) => [key, formData.get(key) === "on"])
        ),
        enquiryItemId: requiredText(formData, "enquiry_item_id"),
        feasibilityReason: optionalText(formData, "feasibility_reason"),
        grade: optionalText(formData, "grade"),
        missingInformation: optionalText(formData, "missing_information"),
        status: requiredText(formData, "technical_review_status"),
        technicalRemarks: optionalText(formData, "technical_remarks"),
      })
  )
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
}

export async function completeSalesClarificationAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  await withWorkflow(
    "pricing.sales.write",
    `${enquiriesPath}/${enquiryId}`,
    (workflow, actorUserId) =>
      workflow.completeSalesClarification({
        actorUserId,
        clarificationTaskId: requiredText(formData, "clarification_task_id"),
        enquiryItemId: requiredText(formData, "enquiry_item_id"),
        response: optionalText(formData, "response"),
      })
  )
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
}

export async function saveDesignAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  const portfolioMatchStatus = requiredText(formData, "portfolio_match_status")
  const quotedPartUid = optionalText(formData, "quoted_part_uid")
  await withWorkflow(
    "pricing.design.write",
    `${enquiriesPath}/${enquiryId}`,
    (workflow, actorUserId) =>
      workflow.saveDesign({
        actorUserId,
        bomLines:
          portfolioMatchStatus === "Matches Existing Portfolio" ||
          !quotedPartUid
            ? []
            : [
                {
                  casting: numeric(formData, "casting", 1),
                  componentCode: quotedPartUid,
                  componentSource: "New",
                  grade: optionalText(formData, "grade"),
                  lineNumber: 1,
                  pieceWeight: numeric(formData, "piece_weight"),
                  quantity: 1,
                  rodSize: optionalText(formData, "rod_size"),
                  rodType: optionalText(formData, "rod_type"),
                },
              ],
        designRemarks: optionalText(formData, "design_remarks"),
        designStatus: requiredText(formData, "design_status"),
        enquiryItemId: requiredText(formData, "enquiry_item_id"),
        itemType: requiredText(formData, "item_type"),
        manufacturingProcess: optionalText(formData, "manufacturing_process"),
        matchedProductId: optionalText(formData, "matched_product_id"),
        portfolioMatchStatus,
        quotedPartUid: quotedPartUid ?? null,
      })
  )
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
}

export async function prepareCostingAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  await withWorkflow(
    "pricing.costing.write",
    `${enquiriesPath}/${enquiryId}`,
    (workflow, actorUserId) =>
      workflow.prepareCostingFromDesign(
        requiredText(formData, "enquiry_item_id"),
        actorUserId
      )
  )
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
  revalidatePath("/commercial/products")
}

export async function importEnquiryLinesAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  const organizationId = requiredText(formData, "organization_id")
  const raw = JSON.parse(requiredText(formData, "rows_json")) as unknown
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("rows_json must be a non-empty JSON array")
  }
  const rows = raw.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Import row ${index + 1} must be an object`)
    }
    return {
      rawValues: value as Record<string, unknown>,
      rowNumber: index + 1,
      status: "Unclassified",
    }
  })
  await withWorkflow(
    "pricing.enquiries.write",
    `${enquiriesPath}/${enquiryId}`,
    async (workflow) => {
      await workflow.createImportReview({
        enquiryId,
        importKey: requiredText(formData, "import_key"),
        organizationId,
        rows,
      })
    }
  )
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
}

export async function applyEnquiryImportReviewAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  const reviewId = requiredText(formData, "review_id")
  const parsed = JSON.parse(requiredText(formData, "row_numbers")) as unknown
  if (
    !Array.isArray(parsed) ||
    parsed.some(
      (rowNumber) =>
        !Number.isInteger(rowNumber) || Number(rowNumber) <= 0
    )
  ) {
    throw new Error("row_numbers must contain positive integers")
  }
  const rowNumbers = [...new Set(parsed.map(Number))]
  const decisions = rowNumbers.map((rowNumber) => ({
    action: requiredText(formData, `action_${rowNumber}`),
    rowNumber,
  }))
  await withWorkflow(
    "pricing.enquiries.write",
    `${enquiriesPath}/${enquiryId}`,
    (workflow, actorUserId) =>
      workflow.applyImportReview({
        actorUserId,
        decisions,
        reviewId,
      })
  )
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
}
