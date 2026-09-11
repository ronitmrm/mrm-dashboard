import { createRecruitmentRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"
import { requireHrPage } from "@/lib/auth/require-hr-page"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuthenticatedSession("/hr?panel=candidatesPanel")
  const granted = await listGrantedCapabilities(session.user.id, [
    "masters.universal.candidates.read",
  ])
  if (!granted.includes("masters.universal.candidates.read")) {
    await requireHrPage(
      "hr.candidate_search.read",
      "/hr?panel=candidateSearchPanel"
    )
  }
  const { id } = await params
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const resume = await repository.getCandidateResume(organizationId, id)
    return await createArtifactDeliveryResponse(request, resume, {
      download: !new URL(request.url).searchParams.has("preview"),
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Candidate resume could not be loaded. Please try again.",
      unavailable: "Candidate resume is unavailable.",
    })
    if (delivery) return delivery
    if (error instanceof Error && error.message.includes("not found")) {
      return new Response(error.message, { status: 404 })
    }
    throw error
  } finally {
    await repository.close()
  }
}
