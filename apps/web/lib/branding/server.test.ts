import { beforeEach, expect, it, vi } from "vitest"

const access = vi.hoisted(() => ({ grants: ["iso.documents.approve"] }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/postgres-runtime", () => ({ getWebPostgresPool: () => ({}) }))
vi.mock("@/lib/auth/require-capability", () => ({
  requireAuthenticatedSession: async () => ({
    user: { id: "manager", name: "Manager" },
  }),
  listGrantedCapabilities: async () => access.grants,
  requireCapability: async () => {
    throw new Error("No template write permission")
  },
}))
vi.mock("@workspace/db", () => ({
  createBrandingRepository: () => ({
    organizationId: async () => "organization",
    approvalDepartments: async () => ["Quality"],
    close: async () => {},
  }),
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("Not found")
  },
  redirect: () => {
    throw new Error("Unauthorized")
  },
}))

import { withBranding } from "./server"

beforeEach(() => {
  access.grants = ["iso.documents.approve"]
})

it("keeps a document approver's department scope in the retained template workspace", async () => {
  const departments = await withBranding(
    "sop",
    "read",
    async (context) => context.permittedDepartments
  )
  expect(departments).toEqual(["Quality"])
  await expect(
    withBranding("sop", "write", async () => undefined)
  ).rejects.toThrow("No template write permission")
})

it("rejects template reads without a template or control grant", async () => {
  access.grants = []
  await expect(
    withBranding("sop", "read", async () => undefined)
  ).rejects.toThrow("Unauthorized")
})
