import { notFound } from "next/navigation"
import { withCustomerSatisfaction } from "@/lib/iso-document/customer-satisfaction-server"
import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params
  if (
    ![id, fileId].every((x) =>
      /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x)
    )
  )
    notFound()
  return withCustomerSatisfaction(async ({ repository, access }) => {
    const file = await repository.file(access, id, fileId)
    if (!file) notFound()
    try {
      return await createArtifactDeliveryResponse(request, file, {
        download: new URL(request.url).searchParams.has("download"),
      })
    } catch (error) {
      const response = artifactDeliveryErrorResponse(error, {
        failed: "Report file could not be loaded. Try again.",
        unavailable: "Report file is unavailable.",
      })
      if (response) return response
      throw error
    }
  })
}
