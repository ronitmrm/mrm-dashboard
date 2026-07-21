"use server"

import { createCommercialRevisionsRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"

const revisionsPath = "/commercial/revisions"

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

function numberValue(formData: FormData, name: string) {
  const value = Number(requiredText(formData, name))
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`)
  }
  return value
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
  const newValue = ["profit_percent", "scrap_rate"].includes(fieldName)
    ? enteredValue / 100
    : enteredValue
  await withRevisions((repository, actorUserId) =>
    repository.stageBulkPriceRevisionChange({
      actorUserId,
      bulkPriceRevisionId: requiredText(formData, "bulk_price_revision_id"),
      fieldName,
      newValue,
      notes: optionalText(formData, "notes"),
      selectedQuoteItemIds: [requiredText(formData, "selected_quote_item_id")],
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
      itemPatch: { description: optionalText(formData, "description") },
    })
  )
  revalidatePath(revisionsPath)
}

export async function applyEngineeringChangeDecisionAction(formData: FormData) {
  const decision = requiredText(formData, "decision") as
    | "Keep Price Same"
    | "Revise Price"
  const enteredProfit = optionalText(formData, "new_profit_percent")
  await withRevisions((repository, actorUserId) =>
    repository.applyEngineeringChangeDecision({
      actorUserId,
      decision,
      engineeringChangeNoteId: requiredText(
        formData,
        "engineering_change_note_id"
      ),
      newProfitPercent:
        decision === "Revise Price" && enteredProfit !== undefined
          ? Number(enteredProfit) / 100
          : undefined,
      notes: optionalText(formData, "notes"),
      sourceQuoteItemId: requiredText(formData, "source_quote_item_id"),
    })
  )
  revalidatePath(revisionsPath)
  revalidatePath("/commercial/quotes")
}
