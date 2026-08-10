import { readFile } from "node:fs/promises"
import path from "node:path"

import { createRecruitmentRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { userAttachmentDownloadHeaders } from "@/lib/user-attachment-security"

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
    const storageRoot = path.resolve(
      process.env.LOCAL_FILE_STORAGE_PATH ??
        path.join(/*turbopackIgnore: true*/ process.cwd(), "local-data")
    )
    const filePath = path.resolve(storageRoot, ...resume.storageKey.split("/"))
    if (!filePath.startsWith(`${storageRoot}${path.sep}`)) {
      throw new Error("Candidate resume storage key is invalid.")
    }
    const bytes = await readFile(filePath)
    return new Response(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer,
      {
        headers: userAttachmentDownloadHeaders(resume.fileName, bytes.byteLength),
      }
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return new Response(error.message, { status: 404 })
    }
    throw error
  } finally {
    await repository.close()
  }
}
