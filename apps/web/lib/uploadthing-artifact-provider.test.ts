import { describe, expect, test, vi } from "vitest"

import {
  createUploadThingArtifactProvider,
  readUploadThingEnvironment,
} from "./uploadthing-artifact-provider"

describe("UploadThing Artifact provider", () => {
  test("requires a server-only token with an actionable error", () => {
    expect(() => readUploadThingEnvironment({})).toThrow(
      "UPLOADTHING_TOKEN is required"
    )
  })

  test("uploads with public-read and returns the canonical public URL", async () => {
    const uploadFiles = vi.fn().mockResolvedValue({
      data: { key: "file-key", ufsUrl: "https://app.ufs.sh/f/file-key" },
      error: null,
    })
    const provider = createUploadThingArtifactProvider(
      { UPLOADTHING_TOKEN: "server-token" },
      { deleteFiles: vi.fn(), uploadFiles }
    )

    await expect(
      provider.upload({
        bytes: Buffer.from("drawing"),
        customId: "org:sha:size",
        mediaType: "application/pdf",
        name: "drawing.pdf",
      })
    ).resolves.toEqual({
      key: "file-key",
      url: "https://app.ufs.sh/f/file-key",
    })
    expect(uploadFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        customId: "org:sha:size",
        name: "drawing.pdf",
      }),
      { acl: "public-read", contentDisposition: "attachment" }
    )
  })

  test("reports provider upload failures clearly", async () => {
    const provider = createUploadThingArtifactProvider(
      { UPLOADTHING_TOKEN: "server-token" },
      {
        deleteFiles: vi.fn(),
        uploadFiles: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "invalid token" },
        }),
      }
    )

    await expect(
      provider.upload({
        bytes: Buffer.from("drawing"),
        customId: "org:sha:size",
        mediaType: "application/pdf",
        name: "drawing.pdf",
      })
    ).rejects.toThrow("invalid token")
  })

  test("deletes by provider key and reports provider deletion failures", async () => {
    const deleteFiles = vi.fn().mockResolvedValue({ success: true })
    const provider = createUploadThingArtifactProvider(
      { UPLOADTHING_TOKEN: "server-token" },
      { deleteFiles, uploadFiles: vi.fn() }
    )

    await expect(provider.delete({ key: "file-key" })).resolves.toBeUndefined()
    expect(deleteFiles).toHaveBeenCalledWith("file-key")

    deleteFiles.mockRejectedValueOnce(new Error("provider unavailable"))
    await expect(provider.delete({ key: "file-key" })).rejects.toThrow(
      "UploadThing could not delete the retained file."
    )
  })
})
