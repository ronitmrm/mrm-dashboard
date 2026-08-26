import { createRecruitmentRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireHrPage } from "@/lib/auth/require-hr-page"
import { userAttachmentDownloadHeaders } from "@/lib/user-attachment-security"
import { readUserAttachment } from "@/lib/user-attachment-storage"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireHrPage(
    "hr.candidate_search.read",
    "/hr?panel=candidateSearchPanel"
  )
  const { id } = await params
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const resume = await repository.getCandidateResume(organizationId, id)
    if (resume.publicUrl) {
      return Response.redirect(resume.publicUrl, 307)
    }
    if (!resume.storageKey) {
      throw new Error("Candidate resume is unavailable.")
    }
    const file = await readUserAttachment(resume.storageKey)
    return new Response(file.body, {
      headers: userAttachmentDownloadHeaders(resume.fileName, file.byteSize),
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return new Response(error.message, { status: 404 })
    }
    throw error
  } finally {
    await repository.close()
  }
}
