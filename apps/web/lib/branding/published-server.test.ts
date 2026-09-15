import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  repository: {
    organizationId: vi.fn().mockResolvedValue("mrmpl"),
    close: vi.fn(),
  },
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/require-capability", () => ({
  requireAuthenticatedSession: mocks.authenticate,
}))
vi.mock("@/lib/postgres-runtime", () => ({ getWebPostgresPool: vi.fn() }))
vi.mock("@workspace/db", () => ({
  createBrandingRepository: () => mocks.repository,
}))
import { withPublishedRegister } from "./published-server"

describe("published register access", () => {
  beforeEach(() => vi.clearAllMocks())
  it("allows a signed-in user without Branding grants", async () => {
    mocks.authenticate.mockResolvedValue({ user: { id: "ordinary-user" } })
    const read = vi.fn().mockResolvedValue([])
    await expect(withPublishedRegister("sop", read)).resolves.toEqual([])
    expect(mocks.authenticate).toHaveBeenCalledWith("/registers/sop")
    expect(read).toHaveBeenCalledWith({
      repository: mocks.repository,
      organizationId: "mrmpl",
      type: "sop",
    })
  })
  it("does not read documents when sign-in is required", async () => {
    mocks.authenticate.mockRejectedValue(new Error("Sign in required"))
    const read = vi.fn()
    await expect(withPublishedRegister("policy", read)).rejects.toThrow(
      "Sign in required"
    )
    expect(read).not.toHaveBeenCalled()
    expect(mocks.repository.organizationId).not.toHaveBeenCalled()
  })
})
