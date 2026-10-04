import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  correct: vi.fn(),
  organizationIdForCode: vi.fn(),
  requireCapability: vi.fn(),
}))

vi.mock("@workspace/db", () => ({
  createMaintenanceReportCorrectionRepository: () => ({
    close: mocks.close,
    correct: mocks.correct,
    organizationIdForCode: mocks.organizationIdForCode,
  }),
}))
vi.mock("@/lib/auth/auth", () => ({ readAuthEnvironment: () => ({ connectionString: "postgres://test" }) }))
vi.mock("@/lib/auth/require-capability", () => ({ requireCapability: mocks.requireCapability }))

import { PATCH } from "./route"

const reportId = "11111111-1111-4111-8111-111111111111"
const context = { params: Promise.resolve({ kind: "machine", id: reportId }) }
const details = {
  changedItems: ["Bearing"],
  checklistSteps: [{ id: "22222222-2222-4222-8222-222222222222", sequence: 1, value: "No", remark: "Rechecked" }],
  reason: "Corrected after supervisor review",
  remark: "Bearing changed",
  workDone: "Replaced bearing",
}
const request = (body: Record<string, unknown>) => new Request("http://localhost/api/maintenance/reports/machine/" + reportId, {
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
  method: "PATCH",
})

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.requireCapability.mockResolvedValue({ user: { id: "editor-1" } })
  mocks.organizationIdForCode.mockResolvedValue("organization-1")
})

it("saves a completed report correction with the editor and reason", async () => {
  const response = await PATCH(request(details), context)

  expect(response.status).toBe(200)
  expect(mocks.requireCapability).toHaveBeenCalledWith("maintenance.tasks.write", "/iso-document/machine-maintenance-register")
  expect(mocks.correct).toHaveBeenCalledWith({
    ...details, actorUserId: "editor-1", kind: "machine",
    organizationId: "organization-1", reportId,
  })
  expect(mocks.close).toHaveBeenCalledOnce()
})

it("rejects a correction without a reason before writing", async () => {
  const response = await PATCH(request({ ...details, reason: " " }), context)

  expect(response.status).toBe(400)
  expect(mocks.correct).not.toHaveBeenCalled()
})
