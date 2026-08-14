import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const dashboardMocks = vi.hoisted(() => ({
  readPostgresDashboardState: vi.fn(),
}))
let telemetryLog: ReturnType<typeof vi.spyOn>

vi.mock("@/lib/production-module", () => ({
  productionModuleIsEnabled: () => true,
}))

vi.mock("@/lib/auth/auth", () => ({
  getAuth: vi.fn(),
  readAuthEnvironment: vi.fn(),
}))

vi.mock("@/lib/dashboard-api-policy", () => ({
  browserImportPolicy: vi.fn(),
  exportUnavailablePayload: vi.fn(),
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
    dashboardMocks.readPostgresDashboardState.mockReset()
    telemetryLog = vi.spyOn(console, "info").mockImplementation(() => undefined)
  })

  afterEach(() => telemetryLog.mockRestore())

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
      "http://localhost/api/dashboard-state?floor=cnc&knownVersion=7&month=2026-07"
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
      7
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
