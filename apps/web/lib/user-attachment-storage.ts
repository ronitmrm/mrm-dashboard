import { del, get, put } from "@vercel/blob"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

type AttachmentBody = ArrayBuffer | ReadableStream<Uint8Array>

type SaveAttachmentInput = {
  bytes: Buffer
  mediaType: string
  storageKey: string
}

type StoredAttachment = {
  body: AttachmentBody
  byteSize: number
}

export type HostedAttachmentClient = {
  delete(storageKey: string): Promise<void>
  read(storageKey: string): Promise<StoredAttachment | null>
  save(input: SaveAttachmentInput): Promise<void>
}

type AttachmentStorageEnvironment = {
  blobToken?: string
  hosted: boolean
  localRoot: string
}

type CreateUserAttachmentStorageInput = {
  environment?: AttachmentStorageEnvironment
  hostedClient?: HostedAttachmentClient
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

function createLocalAttachmentStorage(
  environment: AttachmentStorageEnvironment
): UserAttachmentStorage {
  return {
    async delete(storageKey) {
      await unlink(localFilePath(environment.localRoot, storageKey))
    },
    async read(storageKey) {
      try {
        const bytes = await readFile(
          localFilePath(environment.localRoot, storageKey)
        )
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
      const filePath = localFilePath(environment.localRoot, storageKey)
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, bytes, { flag: "wx" })
    },
  }
}

function createVercelBlobClient(token: string): HostedAttachmentClient {
  return {
    async delete(storageKey) {
      await del(validatedStorageKey(storageKey), { token })
    },
    async read(storageKey) {
      const result = await get(validatedStorageKey(storageKey), {
        access: "private",
        token,
      })
      if (!result || result.statusCode !== 200) return null
      return {
        body: result.stream,
        byteSize: result.blob.size,
      }
    },
    async save({ bytes, mediaType, storageKey }) {
      await put(validatedStorageKey(storageKey), bytes, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: mediaType,
        token,
      })
    },
  }
}

function runtimeEnvironment(): AttachmentStorageEnvironment {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  const locallyManaged = process.env.MRM_LOCAL_MANAGED_RUNTIME === "1"
  return {
    blobToken,
    hosted:
      process.env.VERCEL === "1" ||
      (process.env.MRM_MANAGED_RUNTIME === "1" && !locallyManaged) ||
      Boolean(blobToken),
    localRoot:
      process.env.LOCAL_FILE_STORAGE_PATH ??
      path.join(/*turbopackIgnore: true*/ process.cwd(), "local-data"),
  }
}

export function createUserAttachmentStorage(
  input: CreateUserAttachmentStorageInput = {}
): UserAttachmentStorage {
  const environment = input.environment ?? runtimeEnvironment()
  if (!environment.hosted) return createLocalAttachmentStorage(environment)
  if (!environment.blobToken) {
    throw new Error(
      "Hosted attachment storage is not configured. Connect a private Vercel Blob store to this project."
    )
  }
  const client = input.hostedClient ?? createVercelBlobClient(environment.blobToken)
  return {
    async delete(storageKey) {
      await client.delete(validatedStorageKey(storageKey))
    },
    async read(storageKey) {
      const result = await client.read(validatedStorageKey(storageKey))
      if (!result) throw attachmentNotFound()
      return result
    },
    async save(saveInput) {
      await client.save({
        ...saveInput,
        storageKey: validatedStorageKey(saveInput.storageKey),
      })
    },
  }
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
