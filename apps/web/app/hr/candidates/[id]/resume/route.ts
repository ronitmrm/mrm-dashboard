import { createRecruitmentRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { userAttachmentDownloadHeaders } from "@/lib/user-attachment-security"
import { readUserAttachment } from "@/lib/user-attachment-storage"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireCapability("hr.recruitment.read", "/hr?panel=candidatesPanel")
  const { id } = await params
  const repository = createRecruitmentRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const resume = await repository.getCandidateResume(organizationId, id)
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
