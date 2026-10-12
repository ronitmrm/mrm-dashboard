"use server"
import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { withIsoWorkflows } from "@/lib/iso-document/workflows-server"

function message(error: unknown) {
  unstable_rethrow(error)
  return error instanceof Error && !("code" in error)
    ? error.message
    : "The record could not be saved. Refresh and try again."
}
function refresh() {
  revalidatePath("/iso-document", "layout")
}
export async function saveIsoWorkflow(input: {
  documentId: string
  version: number
  metadataVersion: number
  text: string
  department: string
  ownerUserId: string | null
  dueOn: string | null
  reason: string
}) {
  try {
    await withIsoWorkflows(({ repository, access }) =>
      repository.saveWorkflow(access, input)
    )
    refresh()
    return { success: true }
  } catch (error) {
    return { error: message(error) }
  }
}
export async function assignIsoTask(input: {
  key: string
  version: number
  department: string
  ownerUserId: string | null
  dueOn: string | null
  reason: string
}) {
  try {
    await withIsoWorkflows(({ repository, access }) =>
      repository.assign(access, input)
    )
    refresh()
    return { success: true }
  } catch (error) {
    return { error: message(error) }
  }
}
export async function createIsoAction(input: {
  documentId: string
  title: string
  expectedResult: string
  department: string
  ownerUserId: string | null
  dueOn: string | null
  sourceHref?: string
  reason: string
}) {
  try {
    const id = await withIsoWorkflows(({ repository, access }) =>
      repository.createAction(access, input)
    )
    refresh()
    return { success: true, id }
  } catch (error) {
    return { error: message(error) }
  }
}
export async function updateIsoAction(input: {
  id: string
  version: number
  operation: "progress" | "complete" | "verify" | "return" | "reopen"
  remarks: string
  evidence?: string
}) {
  try {
    await withIsoWorkflows(({ repository, access }) =>
      repository.updateAction(access, input)
    )
    refresh()
    return { success: true }
  } catch (error) {
    return { error: message(error) }
  }
}
