"use server"

import { createCommercialRevisionsRepository } from "@workspace/db"
import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"
import { parsePricingInputWorkbook } from "./input-workbook"

const path = "/commercial/pricing/update"
async function uploadedRows(formData: FormData) {
  const file = formData.get("workbook")
  if (
    !(file instanceof File) ||
    !file.name.toLowerCase().endsWith(".xlsx") ||
    file.size === 0 ||
    file.size > 10 * 1024 * 1024
  ) {
    throw new Error("Choose an .xlsx pricing input template, up to 10 MB.")
  }
  return parsePricingInputWorkbook(Buffer.from(await file.arrayBuffer()))
}

export async function previewPricingInputs(formData: FormData) {
  await requireCapability(
    commercialTaskCapabilities.stageBulkPriceRevision,
    path
  )
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const preview = await repository.previewPricingInputUpdate(
      "MRMPL",
      await uploadedRows(formData)
    )
    return { ok: true as const, preview }
  } catch (error) {
    unstable_rethrow(error)
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Unable to preview this workbook.",
    }
  } finally {
    await repository.close()
  }
}

export async function applyPricingInputs(formData: FormData) {
  await requireCapability(
    commercialTaskCapabilities.createBulkPriceRevision,
    path
  )
  await requireCapability(
    commercialTaskCapabilities.stageBulkPriceRevision,
    path
  )
  const session = await requireCapability(
    commercialTaskCapabilities.completeBulkPriceRevision,
    path
  )
  const repository = createCommercialRevisionsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const revision = await repository.applyPricingInputUpdate({
      organizationCode: "MRMPL",
      actorUserId: session.user.id,
      rows: await uploadedRows(formData),
      previewToken: String(formData.get("preview_token") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    })
    for (const route of [
      "/commercial/pricing",
      "/commercial/pricing/revisions",
      "/commercial/customer-bulk-revision",
      "/commercial/product-bulk-revision",
      "/commercial/products",
      "/commercial/customer-costing",
      "/commercial/product-costing",
    ])
      revalidatePath(route)
    return { ok: true as const, revision }
  } catch (error) {
    unstable_rethrow(error)
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Unable to apply this workbook.",
    }
  } finally {
    await repository.close()
  }
}
