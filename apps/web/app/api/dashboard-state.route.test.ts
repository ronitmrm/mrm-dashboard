import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const dashboardMocks = vi.hoisted(() => ({
  latest: vi.fn(),
  rawMaterialInwardTemplateRows: vi.fn(),
  readRequestAuthenticatedSession: vi.fn(),
  readRequestGrantedCapabilitySet: vi.fn(),
  readPostgresDashboardState: vi.fn(),
}))
let telemetryLog: ReturnType<typeof vi.spyOn>

vi.mock("@/lib/production-module", () => ({
  productionModuleIsEnabled: () => true,
}))

vi.mock("@/lib/auth/auth", () => ({
  getAuth: vi.fn(),
  readAuthEnvironment: () => ({ connectionString: "postgres://test" }),
}))

vi.mock("../../lib/auth/request-authorization", () => ({
  readRequestAuthenticatedSession:
    dashboardMocks.readRequestAuthenticatedSession,
  readRequestGrantedCapabilitySet:
    dashboardMocks.readRequestGrantedCapabilitySet,
}))

vi.mock("@/lib/dashboard-api-policy", () => ({
  browserImportPolicy: vi.fn(),
}))

vi.mock("@/lib/dashboard-planning-input", () => ({
  normalizeInterruptedSetups: vi.fn(),
  normalizeQueueBeforeSetups: vi.fn(),
  normalizeQueuePlacements: vi.fn(),
  normalizeRemainingSetups: vi.fn(),
  planningSetupNumber: vi.fn(),
}))

vi.mock("@/lib/planning-master-import", () => ({
  planningImportRowError: vi.fn(),
  planningImportValidationError: vi.fn(),
}))

vi.mock("@/lib/planning-refresh-policy", () => ({
  shouldQueuePlanningRefresh: vi.fn(),
}))

vi.mock("@/lib/postgres-dashboard-read-server", () => ({
  DashboardReadError: class DashboardReadError extends Error {
    status = 500
  },
  readPostgresCorrectionCandidates: vi.fn(),
  readPostgresDashboard: vi.fn(),
  readPostgresDashboardState: dashboardMocks.readPostgresDashboardState,
  readPostgresDashboardStatus: vi.fn(),
  requestPostgresDashboardCorrection: vi.fn(),
  requestPostgresDashboardRefresh: vi.fn(),
  withDashboardReadRepository: vi.fn(async (_request, operation) =>
    operation({
      actorUserId: "user-1",
      organizationId: "organization-1",
      repository: {
        latest: dashboardMocks.latest,
        rawMaterialInwardTemplateRows:
          dashboardMocks.rawMaterialInwardTemplateRows,
      },
    })
  ),
}))

vi.mock("@/lib/postgres-operational-entry-server", () => ({
  executePostgresOperationalEntry: vi.fn(),
  isPostgresOperationalEntryType: vi.fn(),
  OperationalEntryError: class OperationalEntryError extends Error {
    status = 500
  },
  readPostgresEmployeeMaster: vi.fn(),
  readPostgresHourlyQualityPage: vi.fn(),
  readPostgresSetupChecklistPage: vi.fn(),
}))

import { GET } from "./[...path]/route"

describe("dashboard-state route", () => {
  beforeEach(() => {
    for (const mock of Object.values(dashboardMocks)) mock.mockReset()
    telemetryLog = vi.spyOn(console, "info").mockImplementation(() => undefined)
  })

  afterEach(() => telemetryLog.mockRestore())

  it("builds RM Inward CSV from current pending receipts, not stale dashboard rows", async () => {
    dashboardMocks.readRequestAuthenticatedSession.mockResolvedValue({
      user: { id: "user-1" },
    })
    dashboardMocks.readRequestGrantedCapabilitySet.mockResolvedValue(
      new Set(["entries.cnc.rm_inward.read"])
    )
    dashboardMocks.latest.mockResolvedValue({
      productionControl: {
        workOrders: [{ jcNo: "JC-ALREADY-INWARDED", rmStatus: "Waiting" }],
      },
    })
    dashboardMocks.rawMaterialInwardTemplateRows.mockResolvedValue([
      { jcNo: "JC-PENDING", partCode: "PART-1", rmPoNo: "RM-PO-1" },
    ])

    const request = new NextRequest(
      "http://localhost/api/data-template?entryType=rm_inward&floor=cnc"
    )
    const response = await GET(request, {
      params: Promise.resolve({ path: ["data-template"] }),
    })
    const csv = await response.text()

    expect(response.status).toBe(200)
    expect(csv).toContain("JC-PENDING")
    expect(csv).not.toContain("JC-ALREADY-INWARDED")
    expect(dashboardMocks.rawMaterialInwardTemplateRows).toHaveBeenCalledWith(
      "organization-1",
      "cnc"
    )
    expect(dashboardMocks.latest).not.toHaveBeenCalled()
  })

  it("passes floor and known-version bounds to the dashboard state reader", async () => {
    dashboardMocks.readPostgresDashboardState.mockResolvedValue({
      coverage: null,
      dashboard: null,
      notModified: true,
      productionFloorCode: "cnc",
      status: { isRefreshing: false, status: "idle" },
      version: 7,
    })
    const request = new NextRequest(
      "http://localhost/api/dashboard-state?floor=cnc&knownVersion=7&month=2026-07&scope=maintenance"
    )

    const response = await GET(request, {
      params: Promise.resolve({ path: ["dashboard-state"] }),
    })

    expect(response.status).toBe(200)
    const responseBody = await response.text()
    expect(Buffer.byteLength(responseBody, "utf8")).toBeLessThanOrEqual(1_024)
    expect(JSON.parse(responseBody)).toEqual({
      coverage: null,
      dashboard: null,
      notModified: true,
      productionFloorCode: "cnc",
      status: { isRefreshing: false, status: "idle" },
      version: 7,
    })
    expect(dashboardMocks.readPostgresDashboardState).toHaveBeenCalledWith(
      request,
      {
        endDate: undefined,
        machine: undefined,
        machineType: undefined,
        month: "2026-07",
        operatorId: undefined,
        startDate: undefined,
      },
      "cnc",
      7,
      "maintenance"
    )
    expect(
      (telemetryLog.mock.calls as Array<[unknown, ...unknown[]]>)
        .map(
          ([message]) =>
            JSON.parse(String(message)) as {
              event?: string
              operation?: string
            }
        )
        .find((event) => event.event === "performance.operation")
    ).toEqual(
      expect.objectContaining({
        operation: "dashboard.api.get.dashboard_state",
      })
    )
  })

  it("serializes one changed floor below the response ceiling", async () => {
    dashboardMocks.readPostgresDashboardState.mockResolvedValue({
      coverage: {
        corrections: {
          available: 0,
          limit: 5_000,
          returned: 0,
          truncated: false,
          truncatedGroups: [],
        },
        dataEntries: {
          available: 1_000,
          groups: {},
          limit: 1_000,
          returned: 1_000,
          truncated: false,
          truncatedGroups: [],
        },
        physicalRows: {
          available: 0,
          groups: {},
          limit: 0,
          returned: 0,
          truncated: false,
          truncatedGroups: [],
        },
      },
      dashboard: {
        productionControl: {
          machineRows: Array.from({ length: 1_000 }, (_, index) => ({
            machine: `CNC-${index}`,
          })),
        },
        productionFloorCode: "cnc",
        readModelVersion: 8,
      },
      notModified: false,
      productionFloorCode: "cnc",
      status: { isRefreshing: false, status: "complete" },
      version: 8,
    })
    const request = new NextRequest(
      "http://localhost/api/dashboard-state?floor=cnc"
    )

    const response = await GET(request, {
      params: Promise.resolve({ path: ["dashboard-state"] }),
    })
    const bodyText = await response.text()
    const body = JSON.parse(bodyText) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(Buffer.byteLength(bodyText, "utf8")).toBeLessThanOrEqual(
      2 * 1024 * 1024
    )
    expect(body).toMatchObject({
      dashboard: { productionFloorCode: "cnc", readModelVersion: 8 },
      notModified: false,
      productionFloorCode: "cnc",
      version: 8,
    })
    expect(body.dashboard).not.toHaveProperty("productionFloorSnapshots")
  })
})
