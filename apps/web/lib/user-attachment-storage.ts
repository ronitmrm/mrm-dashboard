import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

type SaveAttachmentInput = {
  bytes: Buffer
  mediaType: string
  storageKey: string
}

type StoredAttachment = {
  body: ArrayBuffer
  byteSize: number
}

type CreateUserAttachmentStorageInput = {
  localRoot?: string
}

export type UserAttachmentStorage = {
  delete(storageKey: string): Promise<void>
  read(storageKey: string): Promise<StoredAttachment>
  save(input: SaveAttachmentInput): Promise<void>
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

function createLocalAttachmentStorage(localRoot: string): UserAttachmentStorage {
  return {
    async delete(storageKey) {
      await unlink(localFilePath(localRoot, storageKey))
    },
    async read(storageKey) {
      try {
        const bytes = await readFile(localFilePath(localRoot, storageKey))
        return {
          body: bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          ) as ArrayBuffer,
          byteSize: bytes.byteLength,
        }
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          throw attachmentNotFound()
        }
        throw error
      }
    },
    async save({ bytes, storageKey }) {
      const filePath = localFilePath(localRoot, storageKey)
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, bytes, { flag: "wx" })
    },
  }
}

function runtimeLocalRoot() {
  return (
    process.env.LOCAL_FILE_STORAGE_PATH ??
    path.join(/*turbopackIgnore: true*/ process.cwd(), "local-data")
  )
}

export function createUserAttachmentStorage(
  input: CreateUserAttachmentStorageInput = {}
): UserAttachmentStorage {
  return createLocalAttachmentStorage(input.localRoot ?? runtimeLocalRoot())
}

export async function deleteUserAttachment(storageKey: string) {
  await createUserAttachmentStorage().delete(storageKey)
}

export async function readUserAttachment(storageKey: string) {
  return createUserAttachmentStorage().read(storageKey)
}

export async function saveUserAttachment(input: SaveAttachmentInput) {
  await createUserAttachmentStorage().save(input)
}
