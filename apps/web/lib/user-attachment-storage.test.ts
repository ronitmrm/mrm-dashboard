import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, test } from "vitest"

import { createUserAttachmentStorage } from "./user-attachment-storage"

describe("user attachment storage", () => {
  test("keeps attachment storage local when Vercel variables are present", async () => {
    const localRoot = await mkdtemp(path.join(tmpdir(), "mrm-attachments-"))
    const previousEnvironment = {
      blobToken: process.env.BLOB_READ_WRITE_TOKEN,
      localRoot: process.env.LOCAL_FILE_STORAGE_PATH,
      managed: process.env.MRM_MANAGED_RUNTIME,
      vercel: process.env.VERCEL,
    }
    delete process.env.BLOB_READ_WRITE_TOKEN
    process.env.LOCAL_FILE_STORAGE_PATH = localRoot
    process.env.MRM_MANAGED_RUNTIME = "1"
    process.env.VERCEL = "1"
    const storageKey = "attachments/candidate-resumes/candidate-1/resume.pdf"

    try {
      const storage = createUserAttachmentStorage()
      await storage.save({
        bytes: Buffer.from("%PDF-local-only\n"),
        mediaType: "application/pdf",
        storageKey,
      })

      const saved = await storage.read(storageKey)
      expect(await new Response(saved.body).text()).toBe("%PDF-local-only\n")

      await storage.delete(storageKey)
      await expect(storage.read(storageKey)).rejects.toThrow(
        "Attachment file was not found."
      )
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        const environmentKey = {
          blobToken: "BLOB_READ_WRITE_TOKEN",
          localRoot: "LOCAL_FILE_STORAGE_PATH",
          managed: "MRM_MANAGED_RUNTIME",
          vercel: "VERCEL",
        }[key]!
        if (value === undefined) delete process.env[environmentKey]
        else process.env[environmentKey] = value
      }
      await rm(localRoot, { force: true, recursive: true })
    }
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
