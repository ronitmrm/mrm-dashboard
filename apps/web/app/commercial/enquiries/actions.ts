"use server"

import { createHash } from "node:crypto"
import path from "node:path"

import {
  authorizeCommercialAttachmentTarget,
  createArtifactService,
  createCommercialWorkflowRepository,
  prepareImportReviewArtifactTarget,
  type CommercialAttachmentAuthorization,
} from "@workspace/db"
import {
  designProductPortfolioHref,
  designTaskCompletionMissingFields,
  designTaskSaveResultHref,
  designTaskShouldPrepareCosting,
  normalizeDesignAllocatedUid,
} from "@workspace/db/commercial-design-domain"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"
import {
  type CommercialArtifactPurpose,
  commercialAttachmentLimitBytes,
  designBomAttachmentFieldName,
  designBomAttachmentPurpose,
  type DesignAttachmentKind,
  validateCommercialAttachment,
} from "@/lib/commercial-attachment"
import { optionalText, requiredText } from "@/lib/form-data"
import {
  technicalReviewChecklistFromFormData,
  technicalReviewReturnPath,
} from "@/lib/pricing/technical-review"
import { createUploadThingArtifactProvider } from "@/lib/uploadthing-artifact-provider"

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

function uuidFromSha256(sha256: string) {
  const hex = sha256.slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`
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
    authorization: CommercialAttachmentAuthorization
    capability: string
    enquiryId: string
    linkPurpose?: string
    organizationId: string
    purpose?: CommercialArtifactPurpose
    targetId: string
    targetTable?: "design_tasks" | "enquiry_items"
  }
) {
  if (file.size > commercialAttachmentLimitBytes) {
    throw new Error("Drawing files must not exceed 25 MB.")
  }
  const session = await requireCapability(
    input.capability,
    `${enquiriesPath}/${input.enquiryId}`
  )
  const bytes = Buffer.from(await file.arrayBuffer())
  const { fileName, mediaType, purpose } = validateCommercialAttachment({
    bytes,
    declaredMediaType: file.type,
    fileName: file.name,
    purpose: input.purpose ?? "drawing",
  })
  const linkPurpose = input.linkPurpose ?? purpose
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const service = createArtifactService({
    connectionString: readAuthEnvironment().connectionString,
    provider: createUploadThingArtifactProvider(),
  })
  try {
    await service.store({
      actorUserId: session.user.id,
      authorizeTarget: (client, { isRetry }) =>
        authorizeCommercialAttachmentTarget(client, input.authorization, {
          actorUserId: session.user.id,
          requireOpenState: !isRetry,
        }),
      bytes,
      fileName,
      idempotencyKey: [
        "commercial-attachment",
        input.targetTable ?? "enquiry_items",
        input.targetId,
        linkPurpose,
        fileName,
        sha256,
      ].join(":"),
      mediaType,
      organizationId: input.organizationId,
      origin: "uploaded",
      purpose: linkPurpose,
      supersedesPurposes:
        purpose === "drawing" || purpose === "sales_clarification"
          ? ["drawing", "sales_clarification"]
          : undefined,
      target: {
        id: input.targetId,
        schema: "sales",
        table: input.targetTable ?? "enquiry_items",
      },
    })
  } finally {
    await service.close()
  }
}

export async function createEnquiryAction(formData: FormData) {
  const enquiry = await withWorkflow(
    commercialTaskCapabilities.createEnquiry,
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
    commercialTaskCapabilities.importEnquiryRegister,
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
    commercialTaskCapabilities.addEnquiryItem,
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
      authorization: {
        enquiryId,
        enquiryItemId: line.id,
        kind: "enquiry_item",
        organizationId,
      },
      capability: commercialTaskCapabilities.addEnquiryItem,
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
    commercialTaskCapabilities.updateEnquiry,
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
    commercialTaskCapabilities.deleteEnquiry,
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
    commercialTaskCapabilities.updateEnquiryItem,
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
      authorization: {
        enquiryId,
        enquiryItemId,
        kind: "enquiry_item",
        organizationId,
      },
      capability: commercialTaskCapabilities.updateEnquiryItem,
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
    commercialTaskCapabilities.handOverEnquiry,
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
    commercialTaskCapabilities.updateTechnicalReview,
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
  const clarificationTaskId = requiredText(formData, "clarification_task_id")
  const enquiryId = requiredText(formData, "enquiry_id")
  const enquiryItemId = requiredText(formData, "enquiry_item_id")
  const organizationId = requiredText(formData, "organization_id")
  const drawing = formData.get("drawing_file")
  if (drawing instanceof File && drawing.size > 0) {
    await persistAttachment(drawing, {
      authorization: {
        clarificationTaskId,
        enquiryId,
        enquiryItemId,
        kind: "sales_clarification",
        organizationId,
      },
      capability: commercialTaskCapabilities.completeSalesClarification,
      enquiryId,
      organizationId,
      purpose: "sales_clarification",
      targetId: enquiryItemId,
    })
  }
  await withWorkflow(
    commercialTaskCapabilities.completeSalesClarification,
    `${enquiriesPath}/${enquiryId}`,
    (workflow, actorUserId) =>
      workflow.completeSalesClarification({
        actorUserId,
        clarificationTaskId,
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
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
  revalidatePath("/commercial/sales")
  revalidatePath("/commercial/technical-review")
}

export async function startDesignWorkAction(formData: FormData) {
  const enquiryItemId = requiredText(formData, "enquiry_item_id")
  await withWorkflow(
    commercialTaskCapabilities.startDesignWork,
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
  const designId = requiredText(formData, "design_id")
  const enquiryId = requiredText(formData, "enquiry_id")
  const enquiryItemId = requiredText(formData, "enquiry_item_id")
  const organizationId = requiredText(formData, "organization_id")
  const saveIntent = optionalText(formData, "design_save_intent") ?? "draft"
  const portfolioLineMatch = /^portfolio:(\d+)$/.exec(saveIntent)
  const portfolioLineIndex = portfolioLineMatch
    ? Number(portfolioLineMatch[1])
    : null
  const portfolioMatchStatus = requiredText(formData, "portfolio_match_status")
  const quotedPartUid = normalizeDesignAllocatedUid(
    optionalText(formData, "quoted_part_uid")
  )
  const values = (name: string) =>
    formData
      .getAll(name)
      .map((value) => (typeof value === "string" ? value.trim() : ""))
  const lineNumbers = values("bom_line_number")
  const componentCodes = values("bom_component_code")
  const componentCategories = values("bom_component_category")
  const componentSources = values("bom_component_source")
  const componentItemTypes = values("bom_component_item_type")
  const componentProductSizes = values("bom_component_product_size")
  const componentSubcategories = values("bom_component_subcategory")
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
  const productionTypes = values("bom_production_type")
  const castings = values("bom_casting")
  const pieceWeights = values("bom_piece_weight")
  const processesRequired = values("bom_process_required")
  const drawingRequirements = values("bom_drawing_requirement")
  const notes = values("bom_notes")
  const parsedBomLines =
    portfolioMatchStatus === "Matches Existing Portfolio"
      ? []
      : lineNumbers
          .map((lineNumber, index) => ({
            bomItem: bomItems[index] || null,
            casting: nullableNumber(castings[index]),
            componentCode:
              normalizeDesignAllocatedUid(componentCodes[index]) ?? "",
            componentCategory: componentCategories[index] || null,
            componentItemType: componentItemTypes[index] || "List",
            componentProductSize: componentProductSizes[index] || null,
            componentSource: componentSources[index] || "New",
            componentSubcategory: componentSubcategories[index] || null,
            drawingRequirement: drawingRequirements[index] || "Required",
            existingProductId: existingProductIds[index] || null,
            grade: grades[index] || null,
            lineNumber: Number(lineNumber || index + 1),
            manufacturingProcess: manufacturingProcesses[index] || null,
            notes: notes[index] || null,
            packagePart: packageParts[index] || null,
            packagePartUid: normalizeDesignAllocatedUid(packagePartUids[index]),
            parentLineNumber: parentLineNumbers[index]
              ? Number(parentLineNumbers[index])
              : null,
            pieceWeight: nullableNumber(pieceWeights[index]),
            productionType: productionTypes[index] || null,
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
              portfolioLineIndex !== null ||
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
            drawingRequirement: "Required",
            grade: optionalText(formData, "grade"),
            lineNumber: 1,
            pieceWeight: numeric(formData, "piece_weight"),
            productionType: optionalText(formData, "manufacturing_process"),
            quantity: 1,
            rodSize: optionalText(formData, "rod_size"),
            rodType: optionalText(formData, "rod_type"),
          },
        ]
  const attachmentFiles = [
    ["internal_drawing_file", "internal_drawing"],
    ["customer_marked_file", "customer_marked"],
    ["cad_file", "cad"],
  ] as const
  for (const [field, purpose] of attachmentFiles) {
    const file = formData.get(field)
    if (file instanceof File && file.size > 0) {
      await persistAttachment(file, {
        authorization: {
          designId,
          enquiryId,
          enquiryItemId,
          kind: "design",
          organizationId,
        },
        capability: commercialTaskCapabilities.saveDesign,
        enquiryId,
        organizationId,
        purpose,
        targetId: designId,
        targetTable: "design_tasks",
      })
    }
  }
  const bomAttachmentKinds = [
    "internal_drawing",
    "customer_marked",
    "cad",
  ] as const satisfies readonly DesignAttachmentKind[]
  for (const line of bomLines) {
    for (const kind of bomAttachmentKinds) {
      const file = formData.get(
        designBomAttachmentFieldName({ kind, lineNumber: line.lineNumber })
      )
      if (file instanceof File && file.size > 0) {
        await persistAttachment(file, {
          authorization: {
            designId,
            enquiryId,
            enquiryItemId,
            kind: "design",
            organizationId,
          },
          capability: commercialTaskCapabilities.saveDesign,
          enquiryId,
          linkPurpose: designBomAttachmentPurpose({
            kind,
            lineNumber: line.lineNumber,
          }),
          organizationId,
          purpose: kind,
          targetId: designId,
          targetTable: "design_tasks",
        })
      }
    }
  }
  const designBomCompleted =
    optionalText(formData, "design_bom_completed") ??
    (optionalText(formData, "design_status") === "Design Complete"
      ? "Yes"
      : "No")
  const completionRequested = saveIntent === "complete"
  let completionMissingFields: string[] = []
  await withWorkflow(
    commercialTaskCapabilities.saveDesign,
    `${enquiriesPath}/${enquiryId}`,
    async (workflow, actorUserId) => {
      const currentTask = completionRequested
        ? await workflow.getDesignTask("MRMPL", enquiryItemId)
        : null
      completionMissingFields = completionRequested
        ? designTaskCompletionMissingFields({
            attachmentPurposes:
              currentTask?.attachments.map(({ purpose }) => purpose) ?? [],
            bomLines,
            checkedBy: optionalText(formData, "checked_by"),
            designBomCompleted,
            designerName: optionalText(formData, "designer_name"),
            fixtureApproxCost: numeric(formData, "fixture_approx_cost"),
            fixtureRequired: optionalText(formData, "fixture_required") ?? "No",
            gaugesRequired: optionalText(formData, "gauges_required") ?? "No",
            inspectionApproxCost: numeric(formData, "inspection_approx_cost"),
            internalPartCategory: optionalText(
              formData,
              "internal_part_category"
            ),
            internalPartSize: optionalText(formData, "internal_part_size"),
            internalPartSubCategory: optionalText(
              formData,
              "internal_part_sub_category"
            ),
            itemType: optionalText(formData, "item_type") ?? "List",
            manufacturingProcess: optionalText(
              formData,
              "manufacturing_process"
            ),
            rootDrawingRequirement:
              optionalText(formData, "drawing_requirement") ?? "Required",
            targetCompletionDate: optionalText(
              formData,
              "target_completion_date"
            ),
            toolingApproxCost: numeric(formData, "tooling_approx_cost"),
            toolingRequired: optionalText(formData, "tooling_required") ?? "No",
          })
        : []
      const completionReady =
        completionRequested && completionMissingFields.length === 0
      const savedDesign = await workflow.saveDesign({
        approvalStatus: optionalText(formData, "approval_status") ?? "Pending",
        actorUserId,
        assemblyRequired: optionalText(formData, "assembly_required") ?? "No",
        bomLines,
        checkedBy: optionalText(formData, "checked_by"),
        completionRequested: completionReady,
        componentsRequired: optionalText(formData, "components_required"),
        designBomCompleted,
        designBomRequired:
          optionalText(formData, "design_bom_required") ?? "Yes",
        designRemarks: optionalText(formData, "design_remarks"),
        drawingRequirement:
          optionalText(formData, "drawing_requirement") ?? "Required",
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
      if (
        designTaskShouldPrepareCosting({
          completionRequested: completionReady,
          designBomCompleted,
          nextStageStatus: savedDesign.nextStageStatus,
        })
      ) {
        await workflow.prepareCostingFromDesign(enquiryItemId, actorUserId)
      }
    }
  )
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
  revalidatePath(designPath)
  revalidatePath(`${designPath}/${enquiryItemId}`)
  revalidatePath(`${designPath}/${enquiryItemId}/new`)
  revalidatePath("/commercial/product-costing")
  if (portfolioLineIndex !== null) {
    if (portfolioLineIndex >= lineNumbers.length) {
      throw new Error("The selected BOM line no longer exists.")
    }
    redirect(
      designProductPortfolioHref({
        customerUid: requiredText(formData, "customer_uid"),
        enquiryItemId,
        lineIndex: portfolioLineIndex,
      })
    )
  }
  redirect(
    designTaskSaveResultHref({
      completionMissingFields,
      completionRequested,
      enquiryItemId,
      section: optionalText(formData, "design_active_section"),
    })
  )
}

export async function requestDesignClarificationAction(formData: FormData) {
  const enquiryId = requiredText(formData, "enquiry_id")
  await withWorkflow(
    commercialTaskCapabilities.requestDesignClarification,
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
    commercialTaskCapabilities.prepareCosting,
    `${enquiriesPath}/${enquiryId}`,
    (workflow, actorUserId) =>
      workflow.prepareCostingFromDesign(
        requiredText(formData, "enquiry_item_id"),
        actorUserId
      )
  )
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
  revalidatePath("/commercial/pricing")
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
  const session = await requireCapability(
    commercialTaskCapabilities.importEnquiryLines,
    `${enquiriesPath}/${enquiryId}`
  )
  const reviewId = uuidFromSha256(importKey)
  const fileName = path.basename(file.name).replace(/[<>:"/\\|?*\r\n]+/g, "_")
  const extension = path.extname(fileName).toLowerCase()
  const mediaType =
    extension === ".csv"
      ? "text/csv"
      : extension === ".xls"
        ? "application/vnd.ms-excel"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  const sourceSha256 = createHash("sha256").update(buffer).digest("hex")
  const artifacts = createArtifactService({
    connectionString: readAuthEnvironment().connectionString,
    provider: createUploadThingArtifactProvider(),
  })
  try {
    await artifacts.store({
      actorUserId: session.user.id,
      authorizeTarget: (client, { isRetry }) =>
        prepareImportReviewArtifactTarget(
          client,
          {
            actorUserId: session.user.id,
            enquiryId,
            importKey,
            organizationId,
            reviewId,
            rows,
          },
          { isRetry }
        ),
      bytes: buffer,
      fileName,
      idempotencyKey: [
        "enquiry-import-review-source",
        reviewId,
        fileName,
        sourceSha256,
      ].join(":"),
      mediaType,
      organizationId,
      origin: "uploaded",
      purpose: "import_source",
      target: {
        id: reviewId,
        schema: "sales",
        table: "enquiry_import_reviews",
      },
    })
  } finally {
    await artifacts.close()
  }
  revalidatePath(`${enquiriesPath}/${enquiryId}`)
  redirect(`${enquiriesPath}/${enquiryId}/import-review/${reviewId}`)
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
    commercialTaskCapabilities.applyEnquiryImportReview,
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
    commercialTaskCapabilities.completeFollowup,
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
