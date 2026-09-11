import { describe, expect, test, vi } from "vitest"

import {
  createUploadThingArtifactProvider,
  readUploadThingEnvironment,
} from "./uploadthing-artifact-provider"

describe("UploadThing retained-file provider", () => {
  test("requires a server-only token with an actionable error", () => {
    expect(() => readUploadThingEnvironment({})).toThrow(
      "UPLOADTHING_TOKEN is required"
    )
  })

  test("reads retained legacy bytes through the provider URL lookup", async () => {
    const getFileUrls = vi.fn().mockResolvedValue({
      data: [{ key: "file-key", url: "https://app.ufs.sh/f/file-key" }],
    })
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(new Response(Buffer.from("drawing")))
    const provider = createUploadThingArtifactProvider(
      { UPLOADTHING_TOKEN: "server-token" },
      { deleteFiles: vi.fn(), getFileUrls },
      fetchImplementation
    )

    await expect(provider.read({ key: "file-key" })).resolves.toEqual(
      Buffer.from("drawing")
    )
    expect(getFileUrls).toHaveBeenCalledWith("file-key")
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://app.ufs.sh/f/file-key",
      expect.objectContaining({ cache: "no-store" })
    )
  })

  test("deletes by provider key and reports provider deletion failures", async () => {
    const deleteFiles = vi
      .fn()
      .mockResolvedValue({ deletedCount: 1, success: true })
    const provider = createUploadThingArtifactProvider(
      { UPLOADTHING_TOKEN: "server-token" },
      { deleteFiles, getFileUrls: vi.fn() }
    )

    await expect(provider.delete({ key: "file-key" })).resolves.toBeUndefined()
    expect(deleteFiles).toHaveBeenCalledWith("file-key")

    deleteFiles.mockResolvedValueOnce({ deletedCount: 0, success: false })
    await expect(provider.delete({ key: "file-key" })).rejects.toThrow(
      "UploadThing could not delete the retained file."
    )
  })
})
