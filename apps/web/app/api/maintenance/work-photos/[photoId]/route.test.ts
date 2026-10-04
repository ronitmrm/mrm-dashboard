import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  closeArtifacts: vi.fn(),
  closeRepository: vi.fn(),
  deleteArtifact: vi.fn(),
  getPhoto: vi.fn(),
  organizationIdForCode: vi.fn(),
  requireCapability: vi.fn(),
  resolveTarget: vi.fn(),
}))

vi.mock("@workspace/db", () => ({
  createArtifactService: () => ({ close: mocks.closeArtifacts, delete: mocks.deleteArtifact }),
  createMaintenanceWorkPhotoRepository: () => ({
    close: mocks.closeRepository,
    getPhoto: mocks.getPhoto,
    organizationIdForCode: mocks.organizationIdForCode,
    resolveTarget: mocks.resolveTarget,
  }),
}))
vi.mock("@/lib/artifact-delivery", () => ({
  artifactDeliveryErrorResponse: vi.fn(),
  createArtifactDeliveryResponse: vi.fn(),
}))
vi.mock("@/lib/auth/auth", () => ({ readAuthEnvironment: () => ({ connectionString: "postgres://test" }) }))
vi.mock("@/lib/auth/require-capability", () => ({ requireCapability: mocks.requireCapability }))
vi.mock("@/lib/google-cloud-artifact-provider", () => ({ createGoogleCloudArtifactProvider: () => ({}) }))
vi.mock("@/lib/maintenance-work-photo-target", () => ({
  parseMaintenanceWorkPhotoTarget: () => ({ kind: "machine", taskKey: "task-1" }),
}))

import { DELETE } from "./route"

const photoId = "11111111-1111-4111-8111-111111111111"
const request = new Request(`http://localhost/api/maintenance/work-photos/${photoId}?kind=machine&taskKey=task-1`)
const context = { params: Promise.resolve({ photoId }) }

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.requireCapability.mockResolvedValue({ user: { id: "user-1" } })
  mocks.organizationIdForCode.mockResolvedValue("organization-1")
  mocks.resolveTarget.mockResolvedValue({ id: "task-id", schema: "maintenance", table: "tasks" })
})

it("removes a photo linked to the authorized maintenance job", async () => {
  mocks.getPhoto.mockResolvedValue({ fileName: "work.jpg" })

  const response = await DELETE(request, context)
  expect(response.status, JSON.stringify(await response.json())).toBe(200)
  expect(mocks.requireCapability).toHaveBeenCalledWith("maintenance.tasks.write", "/?tab=maintenanceTab")
  expect(mocks.deleteArtifact).toHaveBeenCalledWith(expect.objectContaining({
    actorUserId: "user-1", artifactId: photoId, confirmation: "work.jpg", organizationId: "organization-1",
  }))
  expect(mocks.closeRepository).toHaveBeenCalledOnce()
  expect(mocks.closeArtifacts).toHaveBeenCalledOnce()
})

it("does not delete a photo outside the maintenance job", async () => {
  mocks.getPhoto.mockResolvedValue(null)

  expect((await DELETE(request, context)).status).toBe(404)
  expect(mocks.deleteArtifact).not.toHaveBeenCalled()
  expect(mocks.closeRepository).toHaveBeenCalledOnce()
})
