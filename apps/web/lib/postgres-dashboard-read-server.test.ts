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
      "operations.floors.conventional.planner_actions.read",
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

  it("does not allow one PPAC floor grant to read a different floor", async () => {
    mocks.listAllGrantedCapabilities.mockResolvedValue([
      "operations.dashboard.read",
      "operations.floors.conventional.planner_actions.read",
    ])
    const request = new NextRequest("http://localhost/api/dashboard-state")

    await expect(
      readPostgresDashboardState(request, {}, "cnc")
    ).rejects.toMatchObject({ status: 403 })
    expect(mocks.state).not.toHaveBeenCalled()
  })

  it("serves only maintenance data to a role without production-floor access", async () => {
    mocks.listAllGrantedCapabilities.mockResolvedValue(["maintenance.workspace.read"])
    mocks.state.mockResolvedValue({
      coverage: null,
      dashboard: {
        productionFloorCode: "conventional",
        readModelVersion: 7,
        productionControl: {
          machinePlanningRows: [{ machineNo: "M-1", workOrder: "private" }],
          maintenanceScheduleRows: [{ machineNo: "M-1", maintenanceCode: "MT-1" }],
          productionRunRows: [{ machineNo: "M-1", prodDate: "2026-09-23", workOrder: "private" }],
          workOrders: [{ workOrder: "private" }],
        },
        workOrders: [{ workOrder: "private" }],
      },
      notModified: false,
      status: { isRefreshing: false, status: "idle" },
      version: 7,
    })

    const request = new NextRequest("http://localhost/api/dashboard-state")
    const result = await readPostgresDashboardState(
      request, {}, "conventional", undefined, "maintenance"
    )

    expect(result.dashboard).toMatchObject({
      productionControl: {
        maintenanceScheduleRows: [
          { machineNo: "M-1", maintenanceCode: "MT-1" },
        ],
      },
    })
    expect(JSON.stringify(result)).not.toContain("private")
    expect(mocks.state).toHaveBeenCalledOnce()

    mocks.listAllGrantedCapabilities.mockResolvedValue(["operations.dashboard.read"])
    await expect(
      readPostgresDashboardState(request, {}, "conventional", undefined, "maintenance")
    ).rejects.toMatchObject({ status: 403 })
  })

  it("requires dedicated correction authority before reversing operations evidence", async () => {
    mocks.listAllGrantedCapabilities.mockResolvedValue([
      "operations.dashboard.read",
    ])
    const request = new NextRequest("http://localhost/api/reverse-entry")

    await expect(
      requestPostgresDashboardCorrection(request, {
        correctionKind: "productionEntries",
        reason: "Duplicate entry",
        recordId: "11111111-1111-4111-8111-111111111111",
      })
    ).rejects.toMatchObject({ status: 403 })
    expect(mocks.reverseEntry).not.toHaveBeenCalled()

    mocks.listAllGrantedCapabilities.mockResolvedValue([
      "operations.corrections.write",
    ])
    mocks.reverseEntry.mockResolvedValue({ reversed: true })
    await expect(
      requestPostgresDashboardCorrection(request, {
        correctionKind: "productionEntries",
        reason: "Duplicate entry",
        recordId: "11111111-1111-4111-8111-111111111111",
      })
    ).resolves.toEqual({ reversed: true })
  })
})
