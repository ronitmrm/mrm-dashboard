"use server"

import { createCommercialRevisionsRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { optionalText, requiredText } from "@/lib/form-data"

const correctionsPath = "/commercial/corrections"


async function withCorrections<T>(
  operation: (
    repository: ReturnType<typeof createCommercialRevisionsRepository>,
    actorUserId: string
  ) => Promise<T>
) {
  const session = await requireCapability(
    commercialCapabilities.corrections.write,
    correctionsPath
  )
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    return await operation(repository, session.user.id)
  } finally {
    await repository.close()
  }
}

export async function reverseDesignCostingHandoffAction(formData: FormData) {
  await withCorrections((repository, actorUserId) =>
    repository.reverseDesignCostingHandoff({
      actorUserId,
      designTaskId: requiredText(formData, "design_task_id"),
      remarks: optionalText(formData, "remarks"),
    })
  )
  revalidatePath(correctionsPath)
  revalidatePath("/commercial/enquiries")
  revalidatePath("/commercial/product-costing")
  revalidatePath("/commercial/customer-costing")
}

export async function reverseProductEntryAction(formData: FormData) {
  await withCorrections((repository, actorUserId) =>
    repository.reverseProductEntry({
      actorUserId,
      itemId: requiredText(formData, "item_id"),
      remarks: optionalText(formData, "remarks"),
    })
  )
  revalidatePath(correctionsPath)
  revalidatePath("/commercial/products")
}

export async function recordPricingCorrectionAction(formData: FormData) {
  await withCorrections((repository, actorUserId) =>
    repository.recordPricingCorrection({
      actorUserId,
      organizationId: requiredText(formData, "organization_id"),
      reason: requiredText(formData, "reason"),
      requestedAction: requiredText(formData, "requested_action"),
      targetId: requiredText(formData, "target_id"),
      targetTable: "quote_items",
    })
  )
  revalidatePath(correctionsPath)
}
