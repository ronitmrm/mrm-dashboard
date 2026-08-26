import { beforeEach, describe, expect, it, vi } from "vitest"

import { deleteArtifactWith } from "./artifact-deletion-server"

describe("Artifact deletion server boundary", () => {
  const closeLedger = vi.fn()
  const closeArtifacts = vi.fn()
  const deleteArtifact = vi.fn()
  const organizationIdForUser = vi.fn()
  const createLedgerRepository = vi.fn(() => ({
    close: closeLedger,
    organizationIdForUser,
  }))
  const createArtifactService = vi.fn(() => ({
    close: closeArtifacts,
    delete: deleteArtifact,
  }))
  const requireCapability = vi.fn()

  beforeEach(() => {
    closeLedger.mockReset().mockResolvedValue(undefined)
    closeArtifacts.mockReset().mockResolvedValue(undefined)
    deleteArtifact
      .mockReset()
      .mockResolvedValue({ physicalObjectDeleted: false })
    organizationIdForUser.mockReset().mockResolvedValue("organization-1")
    createLedgerRepository.mockClear()
    createArtifactService.mockClear()
    requireCapability.mockReset().mockResolvedValue({ user: { id: "admin-1" } })
  })

  it("authorizes delete separately and binds actor and Organization server-side", async () => {
    await deleteArtifactWith(
      {
        artifactId: "artifact-1",
        confirmation: "issued-quote.pdf",
        reason: "Customer requested removal",
      },
      {
        connectionString: "postgres://test",
        createArtifactService,
        createLedgerRepository,
        provider: { delete: vi.fn(), upload: vi.fn() },
        requireCapability,
      }
    )

    expect(requireCapability).toHaveBeenCalledWith(
      "artifacts.delete",
      "/administration/artifacts"
    )
    expect(deleteArtifact).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      artifactId: "artifact-1",
      confirmation: "issued-quote.pdf",
      organizationId: "organization-1",
      reason: "Customer requested removal",
    })
    expect(closeArtifacts).toHaveBeenCalledOnce()
    expect(closeLedger).toHaveBeenCalledOnce()
  })

  it("opens no repositories when delete authorization fails", async () => {
    requireCapability.mockRejectedValue(new Error("unauthorized"))

    await expect(
      deleteArtifactWith(
        { artifactId: "artifact-1", confirmation: "a.pdf", reason: "reason" },
        {
          connectionString: "postgres://test",
          createArtifactService,
          createLedgerRepository,
          provider: { delete: vi.fn(), upload: vi.fn() },
          requireCapability,
        }
      )
    ).rejects.toThrow("unauthorized")
    expect(createLedgerRepository).not.toHaveBeenCalled()
    expect(createArtifactService).not.toHaveBeenCalled()
  })
})
