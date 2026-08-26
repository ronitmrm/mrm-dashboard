import { beforeEach, describe, expect, it, vi } from "vitest"

import { readArtifactLedgerWith } from "./artifact-ledger-server"

const filters = {
  organizationId: "ignored-at-server-boundary",
  page: 2,
  pageSize: 25,
  search: "quote-1042",
}

describe("Artifact ledger server boundary", () => {
  const close = vi.fn()
  const list = vi.fn()
  const organizationIdForUser = vi.fn()
  const createRepository = vi.fn(() => ({
    close,
    list,
    organizationIdForUser,
  }))
  const requireCapability = vi.fn()

  beforeEach(() => {
    close.mockReset().mockResolvedValue(undefined)
    list.mockReset().mockResolvedValue({ rows: [] })
    organizationIdForUser.mockReset().mockResolvedValue("organization-1")
    createRepository.mockClear()
    requireCapability.mockReset().mockResolvedValue({
      user: { id: "administrator-1" },
    })
  })

  it("authorizes read access before resolving the actor Organization and listing rows", async () => {
    await readArtifactLedgerWith(filters, {
      connectionString: "postgres://test",
      createRepository,
      requireCapability,
    })

    expect(requireCapability).toHaveBeenCalledWith(
      "artifacts.read",
      "/administration/artifacts"
    )
    expect(organizationIdForUser).toHaveBeenCalledWith("administrator-1")
    expect(list).toHaveBeenCalledWith({
      ...filters,
      organizationId: "organization-1",
    })
    expect(close).toHaveBeenCalledOnce()
  })

  it("does not open the ledger repository when authorization fails", async () => {
    requireCapability.mockRejectedValue(new Error("unauthorized"))

    await expect(
      readArtifactLedgerWith(filters, {
        connectionString: "postgres://test",
        createRepository,
        requireCapability,
      })
    ).rejects.toThrow("unauthorized")
    expect(createRepository).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
  })
})
