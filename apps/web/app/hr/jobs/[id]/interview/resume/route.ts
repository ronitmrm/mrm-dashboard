import { createRecruitmentRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { hrTaskCapabilities } from "@/lib/auth/task-capabilities"
import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await requireCapability(hrTaskCapabilities.recordInterview, `/hr/jobs/${id}/interview`)
  const url = new URL(request.url)
  const applicationId = url.searchParams.get("application")
  if (!applicationId) return new Response("Application not found.", { status: 404 })

  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const workspace = await repository.getJobWorkspace(organizationId, id)
    const application = workspace?.applications.find(
      (row) => row.id === applicationId && row.scoreableRound !== null
    )
    if (!application) return new Response("Application not found.", { status: 404 })

    const resume = await repository.getCandidateResume(organizationId, application.candidateId)
    return await createArtifactDeliveryResponse(request, resume, {
      download: !url.searchParams.has("preview"),
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
