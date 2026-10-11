"use server"
import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { withSipoc } from "@/lib/iso-document/sipoc-server"
function message(error: unknown) {
  unstable_rethrow(error)
  return error instanceof Error && !("code" in error)
    ? error.message
    : "The process map could not be saved. Try again."
}
export async function saveSipoc(input: {
  id?: string
  version?: number
  fields: unknown
  reason: string
}) {
  try {
    const id = await withSipoc(({ repository, access }) =>
      repository.save(access, input)
    )
    revalidatePath("/iso-document/sipoc")
    return { id }
  } catch (error) {
    return { error: message(error) }
  }
}
export async function transitionSipoc(input: {
  id: string
  version: number
  action: "submit" | "approve" | "return"
  notes: string
}) {
  try {
    await withSipoc(({ repository, access }) =>
      repository.transition(access, input)
    )
    revalidatePath("/iso-document/sipoc")
    return { success: true }
  } catch (error) {
    return { error: message(error) }
  }
}
