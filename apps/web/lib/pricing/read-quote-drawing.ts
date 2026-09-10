import { readUserAttachment } from "../user-attachment-storage"

export async function readQuoteDrawing(drawing: {
  publicUrl: string | null
  storageKey: string
}) {
  if (drawing.publicUrl) {
    const response = await fetch(drawing.publicUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 404 || response.status === 410) return null
    if (!response.ok)
      throw new Error("Drawing could not be downloaded. Please try again.")
    return response.arrayBuffer()
  }
  try {
    return (await readUserAttachment(drawing.storageKey)).body
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Attachment file was not found."
    )
      return null
    throw error
  }
}
