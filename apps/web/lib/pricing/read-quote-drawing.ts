import { ArtifactStorageError, type ArtifactByteLocator } from "@workspace/db"

import { readVerifiedArtifactBytes } from "../artifact-delivery"

export async function readQuoteDrawing(drawing: ArtifactByteLocator) {
  try {
    return await readVerifiedArtifactBytes(drawing)
  } catch (error) {
    if (error instanceof ArtifactStorageError && error.code === "not-found") {
      return null
    }
    throw error
  }
}
