import { createHash } from "node:crypto"

import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  createArtifactDeliveryResponse,
  readVerifiedArtifactBytes,
} from "./artifact-delivery"

function locator(bytes: Buffer) {
  return {
    byteSize: bytes.byteLength,
    fileName: "drawing.pdf",
    mediaType: "application/pdf",
    physicalObjectId: "object-1",
    provider: "google-cloud-storage" as const,
    providerKey: "private-key",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    storageKey: null,
  }
}

describe("private Artifact delivery", () => {
  it("verifies retained bytes before returning a streamed private response", async () => {
    const bytes = Buffer.from("%PDF-private\n")
    const read = vi.fn().mockResolvedValue(bytes)
    const response = await createArtifactDeliveryResponse(
      new Request("https://mrm.example/administration/artifacts/1/content"),
      locator(bytes),
      { download: true },
      { providerFor: () => ({ read }) }
    )

    expect(await response.text()).toBe("%PDF-private\n")
    expect(read).toHaveBeenCalledWith({ key: "private-key" })
    expect(response.headers.get("content-type")).toBe("application/pdf")
    expect(response.headers.get("content-length")).toBe(
      String(bytes.byteLength)
    )
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN")
  })

  it("rejects size or SHA mismatch before constructing a response", async () => {
    const expected = Buffer.from("expected")
    const corrupted = Buffer.from("corrupt!")
    await expect(
      readVerifiedArtifactBytes(locator(expected), {
        providerFor: () => ({ read: vi.fn().mockResolvedValue(corrupted) }),
      })
    ).rejects.toMatchObject({ code: "integrity-failure" })
  })
})
