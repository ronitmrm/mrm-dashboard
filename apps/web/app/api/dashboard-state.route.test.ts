import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const dashboardMocks = vi.hoisted(() => ({
  readPostgresDashboardState: vi.fn(),
}))

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
  readPostgresHourlyQualityPage: vi.fn(),
  readPostgresSetupChecklistPage: vi.fn(),
}))

import { GET } from "./[...path]/route"

describe("dashboard-state route", () => {
  beforeEach(() => {
    dashboardMocks.readPostgresDashboardState.mockReset()
  })

  it("passes floor and known-version bounds to the dashboard state reader", async () => {
    dashboardMocks.readPostgresDashboardState.mockResolvedValue({
      dashboard: null,
      notModified: true,
      status: { isRefreshing: false, status: "idle" },
    })
    const request = new NextRequest(
      "http://localhost/api/dashboard-state?floor=cnc&knownVersion=7&month=2026-07"
    )

    const response = await GET(request, {
      params: Promise.resolve({ path: ["dashboard-state"] }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      dashboard: null,
      notModified: true,
      status: { isRefreshing: false, status: "idle" },
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
  })
})
