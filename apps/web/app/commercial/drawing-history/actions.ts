"use server"

import {
  createPrintedDrawingHoldingsRepository,
  PrintedDrawingHoldingError,
} from "@workspace/db"
import { parseProductionFloorCode } from "@workspace/db/production-floors"
import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { commercialTaskCapabilities } from "@/lib/auth/task-capabilities"

export async function savePrintedDrawingHoldingAction(
  _previous: { error: string; saved: boolean },
  formData: FormData
) {
  const path = "/commercial/drawing-history"
  await requireCapability("pricing.drawing_history.read", path)
  const session = await requireCapability(
    commercialTaskCapabilities.updateDrawingHistory,
    path
  )
  const floor = parseProductionFloorCode(formData.get("unit"))
  const drawingId = formData.get("drawing_id")?.toString() ?? ""
  const quantityText = formData.get("quantity")?.toString().trim() ?? ""
  if (
    !floor ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(drawingId) ||
    !/^\d+$/.test(quantityText)
  ) {
    return {
      error:
        "Choose a drawing and production unit, and enter a whole number of copies.",
      saved: false,
    }
  }
  const repository = createPrintedDrawingHoldingsRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    await repository.saveForOrganization({
      organizationCode: "MRMPL",
      drawingId,
      productionFloorCode: floor,
      quantity: Number(quantityText),
      location: formData.get("location")?.toString() ?? "",
      actorUserId: session.user.id,
    })
    revalidatePath(path)
    revalidatePath(`${path}/[uid]`, "page")
    return { error: "", saved: true }
  } catch (error) {
    unstable_rethrow(error)
    return {
      error:
        error instanceof PrintedDrawingHoldingError
          ? error.message
          : "Could not save printed copies. Try again.",
      saved: false,
    }
  } finally {
    await repository.close()
  }
}
