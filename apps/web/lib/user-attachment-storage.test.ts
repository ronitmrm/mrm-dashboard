import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, test } from "vitest"

import { readUserAttachment } from "./user-attachment-storage"
import * as legacyAttachmentStorage from "./user-attachment-storage"

describe("legacy user attachment storage", () => {
  test("exposes read compatibility without a local-write interface", () => {
    expect(Object.keys(legacyAttachmentStorage)).toEqual(["readUserAttachment"])
  })

  test("reads historical local bytes from the configured root", async () => {
    const localRoot = await mkdtemp(path.join(tmpdir(), "mrm-attachments-"))
    const previousLocalRoot = process.env.LOCAL_FILE_STORAGE_PATH
    process.env.LOCAL_FILE_STORAGE_PATH = localRoot
    const storageKey = "attachments/candidate-resumes/candidate-1/resume.pdf"
    const filePath = path.join(localRoot, ...storageKey.split("/"))

    try {
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, "%PDF-legacy\n")
      const saved = await readUserAttachment(storageKey)
      expect(await new Response(saved.body).text()).toBe("%PDF-legacy\n")
    } finally {
      if (previousLocalRoot === undefined)
        delete process.env.LOCAL_FILE_STORAGE_PATH
      else process.env.LOCAL_FILE_STORAGE_PATH = previousLocalRoot
      await rm(localRoot, { force: true, recursive: true })
    }
  })

  test("rejects paths outside the configured legacy root", async () => {
    const localRoot = await mkdtemp(path.join(tmpdir(), "mrm-attachments-"))
    const previousLocalRoot = process.env.LOCAL_FILE_STORAGE_PATH
    process.env.LOCAL_FILE_STORAGE_PATH = localRoot
    try {
      await expect(readUserAttachment("../outside.pdf")).rejects.toThrow(
        "Attachment storage key is invalid."
      )
    } finally {
      if (previousLocalRoot === undefined) {
        delete process.env.LOCAL_FILE_STORAGE_PATH
      } else {
        process.env.LOCAL_FILE_STORAGE_PATH = previousLocalRoot
      }
      await rm(localRoot, { force: true, recursive: true })
    }
  })
})
