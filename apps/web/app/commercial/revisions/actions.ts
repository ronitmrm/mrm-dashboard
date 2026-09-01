"use server"

import {
  bulkRevisionFields,
  createCommercialRevisionsRepository,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"
import { ecnDesignHref, ecnHref } from "@/lib/pricing/ecn-routes"
import { optionalText, requiredText } from "@/lib/form-data"

const revisionsPath = "/commercial/revisions"
const ecnsPath = "/commercial/ecns"
const customerBulkRevisionPath = "/commercial/customer-bulk-revision"
const customerCostingPath = "/commercial/customer-costing"
const productBulkRevisionPath = "/commercial/product-bulk-revision"
const productCostingPath = "/commercial/product-costing"

function numberValue(formData: FormData, name: string) {
  const value = Number(requiredText(formData, name))
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`)
  }
  return value
}

function optionalNumber(formData: FormData, name: string) {
  const value = optionalText(formData, name)
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`)
  }
  return parsed
}

function selectedValues(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
}

function optionalBomLines(formData: FormData) {
  if (optionalText(formData, "bom_mode") === "replace") {
    const componentIds = selectedValues(formData, "bom_component_item_id")
    const quantities = selectedValues(formData, "bom_quantity")
    const notes = formData
      .getAll("bom_notes")
      .map((value) => (typeof value === "string" ? value.trim() : ""))
    return componentIds.map((componentItemId, index) => {
      const quantity = Number(quantities[index])
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`BOM line ${index + 1} requires a positive quantity`)
      }
      return {
        componentItemId,
        notes: notes[index] || null,
        quantity,
      }
    })
  }
  const value = optionalText(formData, "bom_lines_json")
  if (!value) return undefined
  const parsed = JSON.parse(value) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error("bom_lines_json must be an array")
  }
  return parsed.map((line, index) => {
    if (
      !line ||
      typeof line !== "object" ||
      typeof (line as { componentItemId?: unknown }).componentItemId !==
        "string"
    ) {
      throw new Error(`BOM line ${index + 1} requires componentItemId`)
    }
    const quantity = Number((line as { quantity?: unknown }).quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`BOM line ${index + 1} requires a positive quantity`)
    }
    const notes = (line as { notes?: unknown }).notes
    return {
      componentItemId: (
        line as { componentItemId: string }
      ).componentItemId.trim(),
      notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
      quantity,
    }
  })
}

async function withRevisions<T>(
  operation: (
    repository: ReturnType<typeof createCommercialRevisionsRepository>,
    actorUserId: string
  ) => Promise<T>,
  capability: string,
  returnPath: string = revisionsPath
) {
  const session = await requireCapability(capability, returnPath)
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    return await operation(repository, session.user.id)
  } finally {
    await repository.close()
  }
}

export async function createBulkPriceRevisionAction(formData: FormData) {
  const revisionRoute = requiredText(formData, "revision_route") as
    | "Customer Parameter Bulk Revision"
    | "Product Parameter Bulk Revision"
  await withRevisions(
    (repository, actorUserId) =>
      repository.createBulkPriceRevision({
        actorUserId,
        customerId: optionalText(formData, "customer_id"),
        effectiveOn: requiredText(formData, "effective_on"),
        organizationId: requiredText(formData, "organization_id"),
        reason: requiredText(formData, "reason"),
        revisionRoute,
      }),
    commercialTaskCapabilities.createBulkPriceRevision
  )
  revalidatePath(revisionsPath)
  revalidatePath(customerBulkRevisionPath)
  revalidatePath(customerCostingPath)
  revalidatePath(productBulkRevisionPath)
  revalidatePath(productCostingPath)
  if (revisionRoute === "Product Parameter Bulk Revision") {
    redirect(productCostingPath)
  }
}

export async function stageBulkPriceRevisionAction(formData: FormData) {
  const fieldName = requiredText(formData, "field_name")
  const enteredValue = numberValue(formData, "new_value")
  const field =
    fieldName in bulkRevisionFields
      ? bulkRevisionFields[fieldName as keyof typeof bulkRevisionFields]
      : null
  const newValue =
    field?.valueType === "percent" ? enteredValue / 100 : enteredValue
  await withRevisions(
    (repository, actorUserId) =>
      repository.stageBulkPriceRevisionChange({
        actorUserId,
        bulkPriceRevisionId: requiredText(formData, "bulk_price_revision_id"),
        fieldName,
        newValue,
        notes: optionalText(formData, "notes"),
        selectedProductIds: selectedValues(formData, "selected_product_ids"),
        selectedQuoteItemIds: selectedValues(
          formData,
          "selected_quote_item_ids"
        ),
      }),
    commercialTaskCapabilities.stageBulkPriceRevision
  )
  revalidatePath(revisionsPath)
  revalidatePath(customerBulkRevisionPath)
  revalidatePath(productBulkRevisionPath)
  revalidatePath(productCostingPath)
}

export async function deleteBulkPriceRevisionStageAction(formData: FormData) {
  const bulkPriceRevisionId = requiredText(formData, "bulk_price_revision_id")
  await withRevisions(
    (repository, actorUserId) =>
      repository.deleteBulkPriceRevisionStage({
        actorUserId,
        bulkPriceRevisionId,
        stageGroupId: requiredText(formData, "stage_group_id"),
      }),
    commercialTaskCapabilities.deleteBulkPriceRevisionStage
  )
  revalidatePath(revisionsPath)
  revalidatePath(customerBulkRevisionPath)
  revalidatePath(productBulkRevisionPath)
  revalidatePath(productCostingPath)
  revalidatePath(`${productCostingPath}/revisions/${bulkPriceRevisionId}`)
  revalidatePath(customerCostingPath)
  revalidatePath(`${customerCostingPath}/revisions/${bulkPriceRevisionId}`)
}

export async function completeBulkPriceRevisionAction(formData: FormData) {
  const bulkPriceRevisionId = requiredText(formData, "bulk_price_revision_id")
  const completed = await withRevisions(
    (repository, actorUserId) =>
      repository.completeBulkPriceRevision({
        actorUserId,
        bulkPriceRevisionId,
      }),
    commercialTaskCapabilities.completeBulkPriceRevision
  )
  revalidatePath(revisionsPath)
  revalidatePath(customerBulkRevisionPath)
  revalidatePath(productBulkRevisionPath)
  revalidatePath(productCostingPath)
  revalidatePath(`${productCostingPath}/revisions/${bulkPriceRevisionId}`)
  revalidatePath(customerCostingPath)
  revalidatePath(`${customerCostingPath}/revisions/${bulkPriceRevisionId}`)
  revalidatePath("/commercial/quotes")
  if (
    optionalText(formData, "handoff_to_customer") === "true" &&
    completed.status === "Pending Customer Costing"
  ) {
    redirect(
      `${customerCostingPath}/revisions/${encodeURIComponent(bulkPriceRevisionId)}`
    )
  }
  if (
    optionalText(formData, "return_to_customer_costing") === "true" &&
    completed.status === "Completed"
  ) {
    redirect(customerCostingPath)
  }
}

export async function applyProductBulkRevisionPriceDecisionAction(
  formData: FormData
) {
  const bulkPriceRevisionId = requiredText(formData, "bulk_price_revision_id")
  const decision = requiredText(formData, "decision") as
    | "Keep Price Same"
    | "Revise Price"
  await withRevisions(
    (repository, actorUserId) =>
      repository.applyProductBulkRevisionPriceDecision({
        actorUserId,
        bulkPriceRevisionId,
        decision,
        notes: optionalText(formData, "notes"),
        sourceQuoteItemId: requiredText(formData, "source_quote_item_id"),
      }),
    commercialTaskCapabilities.stageBulkPriceRevision,
    customerCostingPath
  )
  revalidatePath(customerCostingPath)
  revalidatePath(`${customerCostingPath}/revisions/${bulkPriceRevisionId}`)
}

export async function createEngineeringChangeNoteAction(formData: FormData) {
  const created = await withRevisions(
    (repository, actorUserId) =>
      repository.createEngineeringChangeNote({
        actorUserId,
        effectiveOn: optionalText(formData, "effective_on"),
        itemId: requiredText(formData, "item_id"),
        organizationId: requiredText(formData, "organization_id"),
        reason: requiredText(formData, "reason"),
      }),
    commercialTaskCapabilities.createEngineeringChangeNote,
    ecnsPath
  )
  revalidatePath(revisionsPath)
  revalidatePath(ecnsPath)
  redirect(ecnDesignHref(created.id))
}

export async function completeEngineeringChangeDesignAction(
  formData: FormData
) {
  const engineeringChangeNoteId = requiredText(
    formData,
    "engineering_change_note_id"
  )
  const bomLines = optionalBomLines(formData)
  const designDetails = {
    bomLines,
    casting: optionalNumber(formData, "casting"),
    category: optionalText(formData, "category"),
    checkedBy: optionalText(formData, "checked_by"),
    description: optionalText(formData, "description"),
    designRemarks: optionalText(formData, "design_remarks"),
    dieCode: optionalText(formData, "die_code"),
    fixtureApproxCost: optionalNumber(formData, "fixture_approx_cost"),
    fixtureRequired: optionalText(formData, "fixture_required"),
    gaugesRequired: optionalText(formData, "gauges_required"),
    inspectionApproxCost: optionalNumber(formData, "inspection_approx_cost"),
    itemType: optionalText(formData, "item_type"),
    operationNotes: optionalText(formData, "operation_notes"),
    productionType: optionalText(formData, "production_type"),
    productSize: optionalText(formData, "product_size"),
    remarks: optionalText(formData, "remarks"),
    rodSize: optionalText(formData, "rod_size"),
    subcategory: optionalText(formData, "subcategory"),
    targetCompletionDate: optionalText(formData, "target_completion_date"),
    toolingApproxCost: optionalNumber(formData, "tooling_approx_cost"),
    toolingRequired: optionalText(formData, "tooling_required"),
    weight100Pcs: optionalNumber(formData, "weight_100_pcs"),
  }
  const saveDraft = optionalText(formData, "design_save_intent") === "draft"
  await withRevisions(
    (repository, actorUserId) =>
      saveDraft
        ? repository.saveEngineeringChangeDesignDraft({
            actorUserId,
            designDetails,
            engineeringChangeNoteId,
          })
        : repository.completeEngineeringChangeDesign({
            actorUserId,
            engineeringChangeNoteId,
            itemPatch: {
              bomLines,
              casting: designDetails.casting,
              designDetails,
              description: designDetails.description,
              dieCode: designDetails.dieCode,
              itemType: designDetails.itemType,
              productionType: designDetails.productionType,
              remarks: designDetails.remarks,
              rodSize: designDetails.rodSize,
              sourcePayloadPatch: {
                category: designDetails.category,
                productDesignDossier: designDetails,
                productSize: designDetails.productSize,
                subcategory: designDetails.subcategory,
              },
              weight100Pcs: designDetails.weight100Pcs,
            },
          }),
    commercialTaskCapabilities.completeEngineeringChangeDesign,
    ecnsPath
  )
  revalidatePath(revisionsPath)
  revalidatePath(ecnsPath)
  revalidatePath(ecnDesignHref(engineeringChangeNoteId))
  revalidatePath(ecnHref(engineeringChangeNoteId))
  redirect(
    saveDraft
      ? ecnDesignHref(engineeringChangeNoteId)
      : ecnHref(engineeringChangeNoteId)
  )
}

export async function completeEngineeringChangeProductCostingAction(
  formData: FormData
) {
  const rejectionPercent = optionalNumber(formData, "rejection_percent")
  const burningLossPercent = optionalNumber(formData, "burning_loss_percent")
  await withRevisions(
    (repository, actorUserId) =>
      repository.completeEngineeringChangeProductCosting({
        actorUserId,
        engineeringChangeNoteId: requiredText(
          formData,
          "engineering_change_note_id"
        ),
        itemPatch: {
          alloyPremium: optionalNumber(formData, "alloy_premium"),
          annealing: optionalNumber(formData, "annealing"),
          assemblyOperationCost: optionalNumber(
            formData,
            "assembly_operation_cost"
          ),
          buffing: optionalNumber(formData, "buffing"),
          burningLossPercent:
            burningLossPercent === undefined
              ? undefined
              : burningLossPercent / 100,
          checking: optionalNumber(formData, "checking"),
          deburring: optionalNumber(formData, "deburring"),
          directPurchasePricePerKg: optionalNumber(
            formData,
            "direct_purchase_price_per_kg"
          ),
          directPurchasePricePerPiece: optionalNumber(
            formData,
            "direct_purchase_price_per_piece"
          ),
          extrusionCost: optionalNumber(formData, "ext_cost"),
          forgingCost: optionalNumber(formData, "forging_cost"),
          machiningCost: optionalNumber(formData, "machining_cost"),
          marking: optionalNumber(formData, "marking"),
          overheadCost: optionalNumber(formData, "overhead_cost"),
          piecesPerKg: optionalNumber(formData, "pieces_per_kg"),
          plating: optionalNumber(formData, "plating"),
          pricingMethod: optionalText(formData, "pricing_method"),
          productCostInr: optionalNumber(formData, "product_cost_inr"),
          rejectionPercent:
            rejectionPercent === undefined ? undefined : rejectionPercent / 100,
          sealant: optionalNumber(formData, "sealant"),
          washing: optionalNumber(formData, "washing"),
        },
      }),
    commercialTaskCapabilities.completeEngineeringChangeCosting,
    ecnsPath
  )
  revalidatePath(revisionsPath)
  revalidatePath(ecnsPath)
}

export async function applyEngineeringChangeDecisionAction(formData: FormData) {
  const decision = requiredText(formData, "decision") as
    | "Keep Price Same"
    | "Revise Price"
  await withRevisions(
    (repository, actorUserId) =>
      repository.applyEngineeringChangeDecision({
        actorUserId,
        decision,
        engineeringChangeNoteId: requiredText(
          formData,
          "engineering_change_note_id"
        ),
        notes: optionalText(formData, "notes"),
        sourceQuoteItemId: requiredText(formData, "source_quote_item_id"),
      }),
    commercialTaskCapabilities.applyEngineeringChangeDecision,
    ecnsPath
  )
  revalidatePath(revisionsPath)
  revalidatePath(ecnsPath)
  revalidatePath("/commercial/quotes")
}
