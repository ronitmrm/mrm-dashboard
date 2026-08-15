"use server"

import { createCommercialRevisionsRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { optionalText, requiredText } from "@/lib/form-data"

const revisionsPath = "/commercial/revisions"


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
  capability: string = commercialCapabilities.revisions.write
) {
  const session = await requireCapability(capability, revisionsPath)
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
  await withRevisions((repository, actorUserId) =>
    repository.createBulkPriceRevision({
      actorUserId,
      customerId: optionalText(formData, "customer_id"),
      effectiveOn: requiredText(formData, "effective_on"),
      organizationId: requiredText(formData, "organization_id"),
      reason: requiredText(formData, "reason"),
      revisionRoute,
    })
  )
  revalidatePath(revisionsPath)
}

export async function stageBulkPriceRevisionAction(formData: FormData) {
  const fieldName = requiredText(formData, "field_name")
  const enteredValue = numberValue(formData, "new_value")
  const newValue =
    fieldName === "profit_percent" ? enteredValue / 100 : enteredValue
  await withRevisions((repository, actorUserId) =>
    repository.stageBulkPriceRevisionChange({
      actorUserId,
      bulkPriceRevisionId: requiredText(formData, "bulk_price_revision_id"),
      fieldName,
      newValue,
      notes: optionalText(formData, "notes"),
      selectedQuoteItemIds: selectedValues(formData, "selected_quote_item_ids"),
    })
  )
  revalidatePath(revisionsPath)
}

export async function deleteBulkPriceRevisionStageAction(formData: FormData) {
  await withRevisions((repository, actorUserId) =>
    repository.deleteBulkPriceRevisionStage({
      actorUserId,
      bulkPriceRevisionId: requiredText(formData, "bulk_price_revision_id"),
      stageGroupId: requiredText(formData, "stage_group_id"),
    })
  )
  revalidatePath(revisionsPath)
}

export async function completeBulkPriceRevisionAction(formData: FormData) {
  await withRevisions((repository, actorUserId) =>
    repository.completeBulkPriceRevision({
      actorUserId,
      bulkPriceRevisionId: requiredText(formData, "bulk_price_revision_id"),
    })
  )
  revalidatePath(revisionsPath)
  revalidatePath("/commercial/quotes")
}

export async function createEngineeringChangeNoteAction(formData: FormData) {
  await withRevisions((repository, actorUserId) =>
    repository.createEngineeringChangeNote({
      actorUserId,
      effectiveOn: optionalText(formData, "effective_on"),
      itemId: requiredText(formData, "item_id"),
      organizationId: requiredText(formData, "organization_id"),
      reason: requiredText(formData, "reason"),
    })
  )
  revalidatePath(revisionsPath)
}

export async function completeEngineeringChangeDesignAction(
  formData: FormData
) {
  await withRevisions((repository, actorUserId) =>
    repository.completeEngineeringChangeDesign({
      actorUserId,
      engineeringChangeNoteId: requiredText(
        formData,
        "engineering_change_note_id"
      ),
      itemPatch: {
        bomLines: optionalBomLines(formData),
        casting: optionalNumber(formData, "casting"),
        description: optionalText(formData, "description"),
        dieCode: optionalText(formData, "die_code"),
        itemType: optionalText(formData, "item_type"),
        materialGradeId: optionalText(formData, "material_grade_id"),
        productionType: optionalText(formData, "production_type"),
        remarks: optionalText(formData, "remarks"),
        rodSize: optionalText(formData, "rod_size"),
        rodTypeId: optionalText(formData, "rod_type_id"),
        weight100Pcs: optionalNumber(formData, "weight_100_pcs"),
      },
    })
  )
  revalidatePath(revisionsPath)
}

export async function completeEngineeringChangeProductCostingAction(
  formData: FormData
) {
  const rejectionPercent = optionalNumber(formData, "rejection_percent")
  const burningLossPercent = optionalNumber(formData, "burning_loss_percent")
  await withRevisions((repository, actorUserId) =>
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
    })
  )
  revalidatePath(revisionsPath)
}

export async function applyEngineeringChangeDecisionAction(formData: FormData) {
  const decision = requiredText(formData, "decision") as
    | "Keep Price Same"
    | "Revise Price"
  await withRevisions((repository, actorUserId) =>
    repository.applyEngineeringChangeDecision({
      actorUserId,
      decision,
      engineeringChangeNoteId: requiredText(
        formData,
        "engineering_change_note_id"
      ),
      notes: optionalText(formData, "notes"),
      sourceQuoteItemId: requiredText(formData, "source_quote_item_id"),
    })
  )
  revalidatePath(revisionsPath)
  revalidatePath("/commercial/quotes")
}
