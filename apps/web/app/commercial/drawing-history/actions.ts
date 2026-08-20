"use server"

import {
  createCommercialReportingRepository,
  createCustomerRepository,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

const drawingHistoryPath = "/commercial/drawing-history"

function value(formData: FormData, key: string) {
  return formData.get(key)?.toString().trim() ?? ""
}

function quantity(formData: FormData, key: string) {
  const parsed = Number(formData.get(key) ?? 0)
  return Number.isInteger(parsed) ? parsed : -1
}

export async function updateDrawingHistoryAction(formData: FormData) {
  const session = await requireCapability(
    "pricing.drawing_history.write",
    drawingHistoryPath
  )
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const repository = createCommercialReportingRepository({ connectionString })
  try {
    await repository.updateDrawingHistory({
      actorUserId: session.user.id,
      buffoliLaminatedQuantity: quantity(
        formData,
        "buffoli_laminated_quantity"
      ),
      cncLaminatedQuantity: quantity(formData, "cnc_laminated_quantity"),
      conventionalLaminatedQuantity: quantity(
        formData,
        "conventional_laminated_quantity"
      ),
      drawingId: value(formData, "drawing_id"),
      drawingNumber: value(formData, "drawing_number"),
      organizationId: await customers.organizationIdForCode("MRMPL"),
      remarks: value(formData, "remarks") || null,
      revision: value(formData, "revision"),
      revisionDate: value(formData, "revision_date"),
    })
  } finally {
    await repository.close()
    await customers.close()
  }
  revalidatePath(drawingHistoryPath)
  redirect(drawingHistoryPath)
}
