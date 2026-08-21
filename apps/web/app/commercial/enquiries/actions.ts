"use server"

import { createHash, randomUUID } from "node:crypto"
import path from "node:path"

import { createCommercialWorkflowRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { optionalText, requiredText } from "@/lib/form-data"
import {
  technicalReviewChecklistFromFormData,
  technicalReviewReturnPath,
} from "@/lib/pricing/technical-review"
import {
  deleteUserAttachment,
  saveUserAttachment,
} from "@/lib/user-attachment-storage"
import { validateUserAttachment } from "@/lib/user-attachment-security"

import {
  parseEnquiryImportFile,
  parseEnquiryRegisterFile,
} from "./enquiry-workbook"

const enquiriesPath = "/commercial/enquiries"
const designPath = "/commercial/design"
const technicalReviewPath = "/commercial/technical-review"

function numeric(formData: FormData, name: string, fallback = 0) {
  const raw = optionalText(formData, name)
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`)
  }
  return value
}

function nullableNumber(value: string | undefined) {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error("BOM values must be numeric")
  return parsed
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

async function persistAttachment(
  file: File,
  input: {
    capability?: string
    enquiryId: string
    organizationId: string
    purpose?: "cad" | "customer_marked" | "drawing" | "internal_drawing"
    targetId: string
    targetTable?: "design_tasks" | "enquiry_items"
  }
) {
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Drawing files must not exceed 25 MB.")
  }
  await withWorkflow(
    input.capability ?? "pricing.enquiries.write",
    `${enquiriesPath}/${input.enquiryId}`,
    async (workflow) => {
      const bytes = Buffer.from(await file.arrayBuffer())
      const { fileName, mediaType } = validateUserAttachment({
        bytes,
        fileName: file.name,
        purpose: "drawing",
      })
      const sha256 = createHash("sha256").update(bytes).digest("hex")
      const sourceId = randomUUID()
      const storageKey = path.posix.join(
        "attachments",
        input.enquiryId,
        input.targetId,
        sourceId,
        fileName
      )
      await saveUserAttachment({ bytes, mediaType, storageKey })
      try {
        await workflow.recordAttachment({
          byteSize: bytes.byteLength,
          fileName,
          mediaType,
          organizationId: input.organizationId,
          sha256,
          sourceId,
          storageKey,
          purpose: input.purpose,
          targetId: input.targetId,
          targetTable: input.targetTable,
        })
      } catch (error) {
        await deleteUserAttachment(storageKey).catch(() => undefined)
        throw error
      }
    }
  )
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

export async function importEnquiryRegisterAction(formData: FormData) {
  const file = formData.get("enquiry_register_file")
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Enquiry register import file is required.")
  }
  const rows = parseEnquiryRegisterFile(
    Buffer.from(await file.arrayBuffer()),
    file.name
  )
  await withWorkflow(
    "pricing.enquiries.write",
    enquiriesPath,
    (workflow, actorUserId) =>
      workflow.importEnquiryRegister({
        actorUserId,
        organizationId: requiredText(formData, "organization_id"),
        receivedOn: requiredText(formData, "received_on"),
        rows,
      })
  )
  revalidatePath(enquiriesPath)
  revalidatePath("/commercial/sales")
  redirect(enquiriesPath)
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
      organizationId,
      targetId: line.id,
    })
  }
  revalidatePath(enquiriesPath)
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
  redirect(`${enquiriesPath}/${enquiryId}`)
}

export async function updateEnquiryAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  await withWorkflow(
    "pricing.enquiries.write",
    `${enquiriesPath}/${enquiryId}`,
    (workflow, actorUserId) =>
      workflow.updateEnquiry({
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
        enquiryId,
        organizationId: requiredText(formData, "organization_id"),
        priority: requiredText(formData, "priority"),
        receivedOn: requiredText(formData, "received_on"),
        remarks: optionalText(formData, "remarks"),
        source: requiredText(formData, "source"),
      })
  )
  revalidatePath(enquiriesPath)
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
}

export async function deleteEnquiryAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  await withWorkflow(
    "pricing.enquiries.write",
    `${enquiriesPath}/${enquiryId}`,
    (workflow, actorUserId) => workflow.deleteEnquiry(enquiryId, actorUserId)
  )
  revalidatePath(enquiriesPath)
  redirect(enquiriesPath)
}

export async function updateEnquiryItemAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  const enquiryItemId = requiredText(formData, "enquiry_item_id")
  const organizationId = requiredText(formData, "organization_id")
  await withWorkflow(
    "pricing.enquiries.write",
    `${enquiriesPath}/${enquiryId}`,
    (workflow, actorUserId) =>
      workflow.updateEnquiryItem({
        actorUserId,
        customerPartCode: requiredText(formData, "part"),
        description: requiredText(formData, "description"),
        drawingReference: optionalText(formData, "drawing_reference"),
        enquiryItemId,
        grade: optionalText(formData, "grade"),
        quantity: numeric(formData, "quantity"),
        remarks: optionalText(formData, "remarks"),
        targetPrice: numeric(formData, "target_price"),
      })
  )
  const drawing = formData.get("drawing_file")
  if (drawing instanceof File && drawing.size > 0) {
    await persistAttachment(drawing, {
      enquiryId,
      organizationId,
      targetId: enquiryItemId,
    })
  }
  revalidatePath(enquiriesPath)
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
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
  const enquiryItemId = requiredText(formData, "enquiry_item_id")
  const status = requiredText(formData, "technical_review_status")
  await withWorkflow(
    "pricing.technical_review.write",
    `${technicalReviewPath}/${enquiryItemId}`,
    (workflow, actorUserId) =>
      workflow.updateTechnicalReview({
        actorUserId,
        checklist: technicalReviewChecklistFromFormData(formData),
        enquiryItemId,
        feasibilityReason: optionalText(formData, "feasibility_reason"),
        grade: optionalText(formData, "grade"),
        missingInformation: optionalText(formData, "missing_information"),
        status,
        technicalRemarks: optionalText(formData, "technical_remarks"),
      })
  )
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
  revalidatePath(technicalReviewPath)
  revalidatePath(`${technicalReviewPath}/${enquiryItemId}`)
  revalidatePath("/commercial/design")
  redirect(technicalReviewReturnPath(status, enquiryItemId))
}

export async function completeSalesClarificationAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  const enquiryItemId = requiredText(formData, "enquiry_item_id")
  const organizationId = requiredText(formData, "organization_id")
  await withWorkflow(
    "pricing.sales.write",
    `${enquiriesPath}/${enquiryId}`,
    (workflow, actorUserId) =>
      workflow.completeSalesClarification({
        actorUserId,
        clarificationTaskId: requiredText(formData, "clarification_task_id"),
        customerPartCode: requiredText(formData, "part"),
        description: requiredText(formData, "description"),
        drawingReference: optionalText(formData, "drawing_reference"),
        enquiryItemId,
        grade: optionalText(formData, "grade"),
        quantity: numeric(formData, "quantity"),
        remarks: optionalText(formData, "remarks"),
        response: optionalText(formData, "response"),
        salesMatchDecision: requiredText(formData, "sales_match_decision"),
        targetPrice: numeric(formData, "target_price"),
      })
  )
  const drawing = formData.get("drawing_file")
  if (drawing instanceof File && drawing.size > 0) {
    await persistAttachment(drawing, {
      enquiryId,
      organizationId,
      targetId: enquiryItemId,
    })
  }
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
  revalidatePath("/commercial/sales")
  revalidatePath("/commercial/technical-review")
}

export async function startDesignWorkAction(formData: FormData) {
  const enquiryItemId = requiredText(formData, "enquiry_item_id")
  await withWorkflow(
    "pricing.design.write",
    designPath,
    (workflow, actorUserId) =>
      workflow.startDesignWork({ actorUserId, enquiryItemId })
  )
  revalidatePath(designPath)
  revalidatePath(`${designPath}/${enquiryItemId}`)
  revalidatePath(`${designPath}/${enquiryItemId}/new`)
  redirect(`${designPath}/${enquiryItemId}/new`)
}

export async function saveDesignAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  const enquiryItemId = requiredText(formData, "enquiry_item_id")
  const organizationId = requiredText(formData, "organization_id")
  const portfolioMatchStatus = requiredText(formData, "portfolio_match_status")
  const quotedPartUid = optionalText(formData, "quoted_part_uid")
  const values = (name: string) =>
    formData
      .getAll(name)
      .map((value) => (typeof value === "string" ? value.trim() : ""))
  const lineNumbers = values("bom_line_number")
  const componentCodes = values("bom_component_code")
  const componentSources = values("bom_component_source")
  const componentItemTypes = values("bom_component_item_type")
  const existingProductIds = values("bom_existing_product_id")
  const parentLineNumbers = values("bom_parent_line_number")
  const quantities = values("bom_quantity")
  const packageParts = values("bom_package_part")
  const packagePartUids = values("bom_package_part_uid")
  const bomItems = values("bom_item")
  const rodSizes = values("bom_rod_size")
  const rodTypes = values("bom_rod_type")
  const grades = values("bom_grade")
  const manufacturingProcesses = values("bom_manufacturing_process")
  const castings = values("bom_casting")
  const pieceWeights = values("bom_piece_weight")
  const processesRequired = values("bom_process_required")
  const notes = values("bom_notes")
  const parsedBomLines =
    portfolioMatchStatus === "Matches Existing Portfolio"
      ? []
      : lineNumbers
          .map((lineNumber, index) => ({
            bomItem: bomItems[index] || null,
            casting: nullableNumber(castings[index]),
            componentCode: componentCodes[index] ?? "",
            componentItemType: componentItemTypes[index] || "List",
            componentSource: componentSources[index] || "New",
            existingProductId: existingProductIds[index] || null,
            grade: grades[index] || null,
            lineNumber: Number(lineNumber || index + 1),
            manufacturingProcess: manufacturingProcesses[index] || null,
            notes: notes[index] || null,
            packagePart: packageParts[index] || null,
            packagePartUid: packagePartUids[index] || null,
            parentLineNumber: parentLineNumbers[index]
              ? Number(parentLineNumbers[index])
              : null,
            pieceWeight: nullableNumber(pieceWeights[index]),
            processRequired: processesRequired[index] || null,
            quantity: Number(quantities[index] || 1),
            rodSize: rodSizes[index] || null,
            rodType: rodTypes[index] || null,
          }))
          .filter(
            (line) =>
              line.componentCode ||
              line.existingProductId ||
              line.packagePart ||
              line.bomItem ||
              line.notes ||
              (lineNumbers.length === 1 && line.lineNumber === 1)
          )
  const bomLines =
    parsedBomLines.length || !quotedPartUid
      ? parsedBomLines
      : [
          {
            casting: numeric(formData, "casting", 1),
            componentCode: quotedPartUid,
            componentItemType: "List",
            componentSource: "New",
            grade: optionalText(formData, "grade"),
            lineNumber: 1,
            pieceWeight: numeric(formData, "piece_weight"),
            quantity: 1,
            rodSize: optionalText(formData, "rod_size"),
            rodType: optionalText(formData, "rod_type"),
          },
        ]
  const saved = await withWorkflow(
    "pricing.design.write",
    `${enquiriesPath}/${enquiryId}`,
    (workflow, actorUserId) =>
      workflow.saveDesign({
        approvalStatus: optionalText(formData, "approval_status") ?? "Pending",
        actorUserId,
        assemblyRequired: optionalText(formData, "assembly_required") ?? "No",
        bomLines,
        checkedBy: optionalText(formData, "checked_by"),
        componentsRequired: optionalText(formData, "components_required"),
        designBomCompleted:
          optionalText(formData, "design_bom_completed") ??
          (optionalText(formData, "design_status") === "Design Complete"
            ? "Yes"
            : "No"),
        designBomRequired:
          optionalText(formData, "design_bom_required") ?? "Yes",
        designRemarks: optionalText(formData, "design_remarks"),
        designStatus:
          optionalText(formData, "design_status") ?? "Pending Design",
        designerName: optionalText(formData, "designer_name"),
        enquiryItemId,
        fixtureApproxCost: numeric(formData, "fixture_approx_cost"),
        fixtureRequired: optionalText(formData, "fixture_required") ?? "No",
        gaugesRequired: optionalText(formData, "gauges_required") ?? "No",
        inspectionApproxCost: numeric(formData, "inspection_approx_cost"),
        internalPartCategory: optionalText(formData, "internal_part_category"),
        internalPartSize: optionalText(formData, "internal_part_size"),
        internalPartSubCategory: optionalText(
          formData,
          "internal_part_sub_category"
        ),
        itemType: optionalText(formData, "item_type") ?? "List",
        manufacturingProcess: optionalText(formData, "manufacturing_process"),
        matchedProductId: optionalText(formData, "matched_product_id"),
        operationNotes: optionalText(formData, "operation_notes"),
        packageProcessRequired: optionalText(
          formData,
          "package_process_required"
        ),
        portfolioMatchStatus,
        quotedPartUid: quotedPartUid ?? null,
        revisionNo: optionalText(formData, "revision_no"),
        targetCompletionDate: optionalText(formData, "target_completion_date"),
        toolingApproxCost: numeric(formData, "tooling_approx_cost"),
        toolingRequired: optionalText(formData, "tooling_required") ?? "No",
      })
  )
  for (const [field, purpose] of [
    ["internal_drawing_file", "internal_drawing"],
    ["customer_marked_file", "customer_marked"],
    ["cad_file", "cad"],
  ] as const) {
    const file = formData.get(field)
    if (file instanceof File && file.size > 0) {
      await persistAttachment(file, {
        capability: "pricing.design.write",
        enquiryId,
        organizationId,
        purpose,
        targetId: saved.id,
        targetTable: "design_tasks",
      })
    }
  }
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
  revalidatePath(designPath)
  revalidatePath(`${designPath}/${enquiryItemId}`)
  revalidatePath(`${designPath}/${enquiryItemId}/new`)
}

export async function requestDesignClarificationAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  await withWorkflow(
    "pricing.design.write",
    "/commercial/design",
    (workflow, actorUserId) =>
      workflow.requestDesignClarification({
        actorUserId,
        direction: requiredText(formData, "direction") as
          | "Design to Technical"
          | "Product Costing to Design",
        enquiryItemId: requiredText(formData, "enquiry_item_id"),
        message: requiredText(formData, "message"),
      })
  )
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
  revalidatePath("/commercial/design")
  revalidatePath("/commercial/technical-review")
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
  revalidatePath("/commercial/product-costing")
}

export async function importEnquiryLinesAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  const organizationId = requiredText(formData, "organization_id")
  const file = formData.get("template_file")
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Import file is required.")
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  const rows = parseEnquiryImportFile(buffer, file.name)
  if (!rows.length) {
    throw new Error("Template has no line items.")
  }
  const importKey = createHash("sha256")
    .update(JSON.stringify(rows.map((row) => row.rawValues)))
    .update(enquiryId)
    .digest("hex")
  const review = await withWorkflow(
    "pricing.enquiries.write",
    `${enquiriesPath}/${enquiryId}`,
    (workflow) =>
      workflow.createImportReview({
        enquiryId,
        importKey,
        organizationId,
        rows,
      })
  )
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
  redirect(`${enquiriesPath}/${enquiryId}/import-review/${review.id}`)
}

export async function applyEnquiryImportReviewAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  const reviewId = requiredText(formData, "review_id")
  const parsed = JSON.parse(requiredText(formData, "row_numbers")) as unknown
  if (
    !Array.isArray(parsed) ||
    parsed.some(
      (rowNumber) => !Number.isInteger(rowNumber) || Number(rowNumber) <= 0
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
  redirect(`${enquiriesPath}/${enquiryId}`)
}

export async function completeFollowupAction(formData: FormData) {
  await withWorkflow(
    "pricing.sales.write",
    "/commercial/sales",
    (workflow, actorUserId) =>
      workflow.completeFollowup({
        actorUserId,
        channel: requiredText(formData, "channel"),
        followupId: requiredText(formData, "followup_id"),
        nextDueOn: optionalText(formData, "next_due_on"),
        nextNote: optionalText(formData, "next_note"),
        note: optionalText(formData, "note"),
        status: requiredText(formData, "status"),
      })
  )
  revalidatePath("/commercial/sales")
}
