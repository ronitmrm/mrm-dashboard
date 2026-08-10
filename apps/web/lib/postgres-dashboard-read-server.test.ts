import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  dashboardClose: vi.fn(),
  finishTelemetry: vi.fn(),
  getSession: vi.fn(),
  listAllGrantedCapabilities: vi.fn(),
  organizationIdForCode: vi.fn(),
  recordGrantRead: vi.fn(),
  recordSessionRead: vi.fn(),
  requestRefresh: vi.fn(),
  reverseEntry: vi.fn(),
  setOutcome: vi.fn(),
  state: vi.fn(),
}))

vi.mock("@workspace/db", () => ({
  createAuthorizationRepository: () => ({
    listAllGrantedCapabilities: mocks.listAllGrantedCapabilities,
  }),
  createDashboardReadModelRepository: () => ({
    close: mocks.dashboardClose,
    organizationIdForCode: mocks.organizationIdForCode,
    requestRefresh: mocks.requestRefresh,
    reverseEntry: mocks.reverseEntry,
    state: mocks.state,
  }),
}))

vi.mock("@/lib/auth/auth", () => ({
  getAuth: () => ({ api: { getSession: mocks.getSession } }),
  readAuthEnvironment: () => ({ connectionString: "postgres://test" }),
}))

vi.mock("./auth/auth", () => ({
  getAuth: () => ({ api: { getSession: mocks.getSession } }),
  readAuthEnvironment: () => ({ connectionString: "postgres://test" }),
}))

vi.mock("./auth/authorization-request-telemetry", () => ({
  authorizationRequestTelemetryForCurrentScope: () => ({
    finish: mocks.finishTelemetry,
    telemetry: {
      recordGrantRead: mocks.recordGrantRead,
      recordSessionRead: mocks.recordSessionRead,
      setOutcome: mocks.setOutcome,
    },
  }),
  memoizeAuthorizationRequestRead: (
    _key: string,
    read: () => Promise<unknown>
  ) => read(),
}))

vi.mock("./postgres-runtime", () => ({
  getWebPostgresPool: () => ({ query: vi.fn() }),
}))

vi.mock("./request-telemetry", () => ({
  telemetryRequestId: () => "dashboard-state-test",
}))

import {
  DashboardReadError,
  readPostgresDashboardState,
  requestPostgresDashboardCorrection,
} from "./postgres-dashboard-read-server"

describe("authenticated dashboard state reader", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.getSession.mockResolvedValue({
      user: { email: "operator@example.test", id: "user-1", name: "Operator" },
    })
    mocks.listAllGrantedCapabilities.mockResolvedValue([
      "operations.dashboard.read",
    ])
    mocks.organizationIdForCode.mockResolvedValue("organization-1")
    mocks.state.mockResolvedValue({
      coverage: null,
      dashboard: null,
      notModified: true,
      productionFloorCode: "conventional",
      status: { isRefreshing: false, status: "idle" },
      version: 7,
    })
  })

  it("authorizes before normalizing and reading one requested floor", async () => {
    const request = new NextRequest("http://localhost/api/dashboard-state")

    await expect(
      readPostgresDashboardState(request, { month: "2026-07" }, "invalid", 7)
    ).resolves.toEqual({
      coverage: null,
      dashboard: null,
      notModified: true,
      productionFloorCode: "conventional",
      status: { isRefreshing: false, status: "idle" },
      version: 7,
    })
    expect(mocks.listAllGrantedCapabilities).toHaveBeenCalledWith("user-1")
    expect(mocks.state).toHaveBeenCalledWith(
      "organization-1",
      { month: "2026-07" },
      "conventional",
      7
    )
    expect(mocks.setOutcome).toHaveBeenCalledWith("allowed")
  })

  it("does not open the dashboard repository when authorization fails", async () => {
    mocks.listAllGrantedCapabilities.mockResolvedValue([])
    const request = new NextRequest("http://localhost/api/dashboard-state")

    const error = await readPostgresDashboardState(request, {}, "cnc").catch(
      (caught: unknown) => caught
    )

    expect(error).toBeInstanceOf(DashboardReadError)
    expect(error).toMatchObject({ status: 403 })
    expect(mocks.state).not.toHaveBeenCalled()
    expect(mocks.dashboardClose).not.toHaveBeenCalled()
    expect(mocks.setOutcome).toHaveBeenCalledWith("unauthorized")
  })

  it("requires the dedicated correction grant and trusts the session actor", async () => {
    const request = new NextRequest("http://localhost/api/reverse-entry")
    const input = {
      correctionKind: "plannerPriorities",
      reason: "Duplicate priority",
      recordId: "priority-1",
    }

    await expect(
      requestPostgresDashboardCorrection(request, input)
    ).rejects.toMatchObject({ status: 403 })
    expect(mocks.reverseEntry).not.toHaveBeenCalled()

    mocks.listAllGrantedCapabilities.mockResolvedValue([
      "operations.corrections.write",
    ])
    mocks.reverseEntry.mockResolvedValue({ reversed: true })

    await expect(
      requestPostgresDashboardCorrection(request, input)
    ).resolves.toEqual({ reversed: true })
    expect(mocks.reverseEntry).toHaveBeenCalledWith({
      actorUserId: "user-1",
      correctionKind: "plannerPriorities",
      organizationId: "organization-1",
      reason: "Duplicate priority",
      recordId: "priority-1",
    })
  })
})
