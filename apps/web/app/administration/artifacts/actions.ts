"use server"

import { revalidatePath } from "next/cache"

import { deleteArtifactForUser } from "../../../lib/artifact-deletion-server"
import { requireCapability } from "../../../lib/auth/require-capability"

export type DeleteArtifactActionState = {
  error?: string
  success?: string
}

export async function deleteArtifactAction(
  _previousState: DeleteArtifactActionState,
  formData: FormData
): Promise<DeleteArtifactActionState> {
  const artifactId = String(formData.get("artifactId") ?? "")
  const confirmation = String(formData.get("confirmation") ?? "")
  const reason = String(formData.get("reason") ?? "")
  const session = await requireCapability(
    "artifacts.delete",
    "/administration/artifacts"
  )

  try {
    const result = await deleteArtifactForUser(
      { artifactId, confirmation, reason },
      session.user.id
    )
    revalidatePath("/administration/artifacts")
    return {
      success: result.physicalObjectDeleted
        ? "Artifact and its final stored object were deleted."
        : "Artifact deleted. Shared stored bytes remain available to other records.",
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Artifact deletion could not be completed. Try again.",
    }
  }
}
