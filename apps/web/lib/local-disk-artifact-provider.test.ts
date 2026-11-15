import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, expect, test, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { createLocalDiskArtifactProvider } =
  await import("./local-disk-artifact-provider")

let root: string | undefined
afterEach(async () => {
  if (root) await rm(root, { force: true, recursive: true })
})

test("stores resumable and retained files on disk without overwriting", async () => {
  root = await mkdtemp(path.join(tmpdir(), "mrm-artifacts-"))
  const disk = createLocalDiskArtifactProvider(root)
  const bytes = Buffer.alloc(256 * 1024 + 5, 7)

  const { key, session } = await disk.startResumable({
    customId: "upload-1",
    expectedByteSize: bytes.byteLength,
    mediaType: "image/png",
  })
  const first = { expectedByteSize: bytes.byteLength, session }
  await expect(
    disk.uploadResumableChunk({
      ...first,
      bytes: bytes.subarray(0, 256 * 1024),
      offset: 0,
    })
  ).resolves.toEqual({ complete: false, nextOffset: 256 * 1024 })
  await expect(
    disk.uploadResumableChunk({
      ...first,
      bytes: bytes.subarray(256 * 1024),
      offset: 256 * 1024,
    })
  ).resolves.toEqual({ complete: true, nextOffset: bytes.byteLength })

  const temporary = await disk.readTemporary({ key })
  expect(temporary.bytes.equals(bytes)).toBe(true)

  const stored = await disk.upload({
    bytes,
    customId: "a1",
    mediaType: "image/png",
    name: "a.png",
  })
  await expect(
    disk.upload({
      bytes,
      customId: "a1",
      mediaType: "image/png",
      name: "a.png",
    })
  ).resolves.toEqual(stored)
  await expect(
    disk.upload({
      bytes: Buffer.from("other"),
      customId: "a1",
      mediaType: "image/png",
      name: "a.png",
    })
  ).rejects.toMatchObject({ code: "integrity-failure" })
  expect((await disk.read(stored)).equals(bytes)).toBe(true)

  await disk.deleteTemporary({ generation: temporary.generation, key })
  await disk.delete(stored)
  await expect(disk.read(stored)).rejects.toMatchObject({ code: "not-found" })
})
