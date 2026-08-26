import { readFile } from "node:fs/promises"
import path from "node:path"

type StoredAttachment = {
  body: ArrayBuffer
  byteSize: number
}

function attachmentNotFound() {
  return new Error("Attachment file was not found.")
}

function validatedStorageKey(storageKey: string) {
  const normalized = path.posix.normalize(storageKey)
  if (
    !storageKey ||
    normalized !== storageKey ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    storageKey.includes("\\")
  ) {
    throw new Error("Attachment storage key is invalid.")
  }
  return normalized
}

function localFilePath(localRoot: string, storageKey: string) {
  const root = path.resolve(localRoot)
  const filePath = path.resolve(
    /*turbopackIgnore: true*/ root,
    ...validatedStorageKey(storageKey).split("/")
  )
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Attachment storage key is invalid.")
  }
  return filePath
}

function runtimeLocalRoot() {
  return (
    process.env.LOCAL_FILE_STORAGE_PATH ??
    path.join(/*turbopackIgnore: true*/ process.cwd(), "local-data")
  )
}

export async function readUserAttachment(
  storageKey: string
): Promise<StoredAttachment> {
  try {
    const bytes = await readFile(localFilePath(runtimeLocalRoot(), storageKey))
    return {
      body: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer,
      byteSize: bytes.byteLength,
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw attachmentNotFound()
    }
    throw error
  }
}
