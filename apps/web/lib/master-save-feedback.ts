import { DuplicateMasterError } from "@workspace/db"

export async function withMasterSaveFeedback(save: () => Promise<unknown>) {
  try {
    await save()
  } catch (error) {
    if (
      error instanceof DuplicateMasterError ||
      (error instanceof Error &&
        /already exists|already used/i.test(error.message)) ||
      (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505")
    ) {
      return { error: new DuplicateMasterError().message }
    }
    throw error
  }
}
