"use server"
import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { InterestedPartiesError } from "@workspace/db/interested-parties-domain"
import { withInterestedParties } from "@/lib/iso-document/interested-parties-server"
const value = (data: FormData, key: string) => data.get(key)?.toString() ?? ""
function errorMessage(error: unknown) {
  unstable_rethrow(error)
  return error instanceof InterestedPartiesError
    ? error.message
    : "Could not save. Try again."
}
function refresh() {
  revalidatePath("/iso-document/interested-parties", "layout")
}
export async function saveRequirementAction(data: FormData) {
  try {
    const id = await withInterestedParties(({ repository, access }) =>
      repository.save(
        access,
        Object.fromEntries(data.entries()),
        value(data, "id")
          ? {
              id: value(data, "id"),
              version: Number(value(data, "version")),
              reason: value(data, "reason"),
            }
          : undefined
      )
    )
    refresh()
    return { id }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}
export async function submitMonitoringAction(data: FormData) {
  try {
    await withInterestedParties(({ repository, access }) =>
      repository.submitMonitoring(access, {
        id: value(data, "id"),
        version: Number(value(data, "version")),
        fields: Object.fromEntries(data.entries()),
      })
    )
    refresh()
    return { success: true }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}
export async function decideMonitoringAction(data: FormData) {
  try {
    const decision = value(data, "decision")
    if (decision !== "verify" && decision !== "return")
      throw new InterestedPartiesError("Choose a QA decision.")
    await withInterestedParties(({ repository, access }) =>
      repository.decideMonitoring(access, {
        id: value(data, "id"),
        version: Number(value(data, "version")),
        reviewId: value(data, "reviewId"),
        decision,
        notes: value(data, "notes"),
        nextReviewOn: value(data, "nextReviewOn"),
      })
    )
    refresh()
    return { success: true }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}
