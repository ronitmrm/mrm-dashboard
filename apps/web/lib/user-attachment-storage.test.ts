import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, test } from "vitest"

import {
  createUserAttachmentStorage,
  type HostedAttachmentClient,
} from "./user-attachment-storage"

describe("user attachment storage", () => {
  test("keeps a deployed PDF retrievable without a local application folder", async () => {
    const objects = new Map<string, Uint8Array>()
    const hostedClient: HostedAttachmentClient = {
      async delete(storageKey) {
        objects.delete(storageKey)
      },
      async read(storageKey) {
        const bytes = objects.get(storageKey)
        return bytes
          ? {
              body: bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength
              ) as ArrayBuffer,
              byteSize: bytes.byteLength,
            }
          : null
      },
      async save({ bytes, storageKey }) {
        objects.set(storageKey, Uint8Array.from(bytes))
      },
    }
    const storage = createUserAttachmentStorage({
      environment: {
        blobToken: "test-token",
        hosted: true,
        localRoot: "/var/task/apps/web/local-data",
      },
      hostedClient,
    })
    const storageKey = "attachments/candidate-resumes/candidate-1/resume.pdf"
    const bytes = Buffer.from("%PDF-1.7\n")

    await storage.save({
      bytes,
      mediaType: "application/pdf",
      storageKey,
    })

    const saved = await storage.read(storageKey)
    expect(saved.byteSize).toBe(bytes.byteLength)
    expect(await new Response(saved.body).text()).toBe("%PDF-1.7\n")

    await storage.delete(storageKey)
    await expect(storage.read(storageKey)).rejects.toThrow(
      "Attachment file was not found."
    )
  })

  test("keeps managed local uploads on the configured local filesystem", async () => {
    const localRoot = await mkdtemp(path.join(tmpdir(), "mrm-attachments-"))
    const previousEnvironment = {
      localRoot: process.env.LOCAL_FILE_STORAGE_PATH,
      localManaged: process.env.MRM_LOCAL_MANAGED_RUNTIME,
      managed: process.env.MRM_MANAGED_RUNTIME,
    }
    process.env.LOCAL_FILE_STORAGE_PATH = localRoot
    process.env.MRM_LOCAL_MANAGED_RUNTIME = "1"
    process.env.MRM_MANAGED_RUNTIME = "1"
    const storageKey = "attachments/local/resume.pdf"

    try {
      const storage = createUserAttachmentStorage()
      await storage.save({
        bytes: Buffer.from("%PDF-local\n"),
        mediaType: "application/pdf",
        storageKey,
      })

      const saved = await storage.read(storageKey)
      expect(await new Response(saved.body).text()).toBe("%PDF-local\n")
    } finally {
      if (previousEnvironment.localRoot === undefined) {
        delete process.env.LOCAL_FILE_STORAGE_PATH
      } else {
        process.env.LOCAL_FILE_STORAGE_PATH = previousEnvironment.localRoot
      }
      if (previousEnvironment.localManaged === undefined) {
        delete process.env.MRM_LOCAL_MANAGED_RUNTIME
      } else {
        process.env.MRM_LOCAL_MANAGED_RUNTIME = previousEnvironment.localManaged
      }
      if (previousEnvironment.managed === undefined) {
        delete process.env.MRM_MANAGED_RUNTIME
      } else {
        process.env.MRM_MANAGED_RUNTIME = previousEnvironment.managed
      }
      await rm(localRoot, { force: true, recursive: true })
    }
  })
})
