"use server"

import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { AnalysisError } from "@workspace/db/iso-analysis-domain"
import {
  ManagementReviewError,
  reviewAgenda,
  type ReviewActionOperation,
} from "@workspace/db/management-review-domain"
import { withManagementReview } from "@/lib/iso-document/management-review-server"

function refresh() {
  revalidatePath("/iso-document/management-review", "layout")
}
function message(error: unknown) {
  unstable_rethrow(error)
  return error instanceof ManagementReviewError ||
    error instanceof AnalysisError
    ? error.message
    : "Could not save the management review. Try again."
}
function value(data: FormData, key: string) {
  return data.get(key)?.toString() ?? ""
}
export async function saveMeetingAction(data: FormData) {
  try {
    let attendees: unknown
    try {
      attendees = JSON.parse(value(data, "attendees"))
    } catch {
      throw new ManagementReviewError("Check the attendee list.")
    }
    const fields = {
      ...Object.fromEntries(data.entries()),
      attendees,
      agenda: reviewAgenda.map(({ key }) => ({
        key,
        outcome: value(data, `${key}.outcome`),
        discussion: value(data, `${key}.discussion`),
        decision: value(data, `${key}.decision`),
        evidence: value(data, `${key}.evidence`),
      })),
    }
    const id = await withManagementReview(({ repository, access }) =>
      repository.saveMeeting(
        access,
        fields,
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
    return { error: message(error) }
  }
}
export async function decideMinutesAction(data: FormData) {
  try {
    const operation = value(data, "operation")
    if (
      operation !== "submit" &&
      operation !== "approve" &&
      operation !== "return" &&
      operation !== "reopen"
    )
      throw new ManagementReviewError("Choose a valid minutes decision.")
    await withManagementReview(({ repository, access }) =>
      repository.decideMinutes(access, {
        id: value(data, "id"),
        version: Number(value(data, "version")),
        operation,
        notes: value(data, "notes"),
      })
    )
    refresh()
    return { success: true }
  } catch (error) {
    return { error: message(error) }
  }
}
export async function saveMeetingPointAction(data: FormData) {
  try {
    const id = await withManagementReview(({ repository, access }) =>
      repository.saveAction(
        access,
        Object.fromEntries(data.entries()),
        value(data, "id")
          ? {
              id: value(data, "id"),
              version: Number(value(data, "version")),
              reason: value(data, "reason"),
            }
          : {
              meetingId: value(data, "meetingId"),
              meetingVersion: Number(value(data, "meetingVersion")),
            }
      )
    )
    refresh()
    return { id }
  } catch (error) {
    return { error: message(error) }
  }
}
export async function carryMeetingPointAction(data: FormData) {
  try {
    await withManagementReview(({ repository, access }) =>
      repository.reviewAction(access, {
        meetingId: value(data, "meetingId"),
        meetingVersion: Number(value(data, "meetingVersion")),
        actionId: value(data, "actionId"),
        notes: value(data, "notes"),
      })
    )
    refresh()
    return { success: true }
  } catch (error) {
    return { error: message(error) }
  }
}
export async function updateMeetingPointAction(data: FormData) {
  try {
    const operation = value(data, "operation")
    const allowed: readonly string[] = [
      "progress",
      "complete",
      "verify",
      "return",
      "reopen",
    ]
    if (!allowed.includes(operation))
      throw new ManagementReviewError("Choose a valid work decision.")
    await withManagementReview(({ repository, access }) =>
      repository.updateAction(access, {
        id: value(data, "id"),
        version: Number(value(data, "version")),
        operation: operation as ReviewActionOperation,
        notes: value(data, "notes"),
        evidenceLocation: value(data, "evidenceLocation"),
        effectivenessNotes: value(data, "effectivenessNotes"),
      })
    )
    refresh()
    return { success: true }
  } catch (error) {
    return { error: message(error) }
  }
}
