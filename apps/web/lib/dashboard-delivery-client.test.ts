import { describe, expect, it } from "vitest"

import {
  dashboardCanonicalRequestUrl,
  dashboardConnectionLabel,
  dashboardCoverageNotice,
  dashboardDeliveryNotice,
  dashboardDeliveryResponseAction,
} from "./dashboard-delivery-client"
import {
  createDashboardDeliveryState,
  dashboardDeliveryReducer,
} from "./dashboard-delivery-state"

const partialCoverage = {
  dataEntries: {
    available: 1_002,
    groups: {
      machine_master: {
        available: 1_002,
        limit: 1_000,
        returned: 1_000,
        truncated: true,
      },
    },
    limit: 1_000,
    returned: 1_000,
    truncated: true,
    truncatedGroups: ["machine_master"],
  },
}

describe("dashboard delivery client", () => {
  it("builds floor-owned canonical URLs with optional known versions", () => {
    expect(
      dashboardCanonicalRequestUrl({
        floor: "cnc",
        knownVersion: 42,
        requestId: 1,
      })
    ).toBe("/api/dashboard-state?floor=cnc&knownVersion=42")
    expect(
      dashboardCanonicalRequestUrl({
        floor: "forging",
        knownVersion: null,
        requestId: 2,
      })
    ).toBe("/api/dashboard-state?floor=forging")
  })

  it("normalizes changed responses into delivery state and partial coverage", () => {
    const action = dashboardDeliveryResponseAction({
      atMs: 1_000,
      currentData: null,
      request: { floor: "cnc", knownVersion: null, requestId: 1 },
      response: {
        coverage: partialCoverage,
        dashboard: {
          productionFloorCode: "cnc",
          readModelVersion: 7,
          rows: ["CNC-1"],
        },
        notModified: false,
        productionFloorCode: "cnc",
        status: { isRefreshing: true, status: "queued" },
        version: 7,
      },
    })

    expect(action).toMatchObject({
      type: "state.changed",
      coverage: "partial",
      floor: "cnc",
      refresh: "pending",
      requestId: 1,
      version: 7,
    })
    expect(dashboardCoverageNotice(action.data, "CNC")).toBe(
      "CNC data is partial: data entries returned 1,000 of 1,002 records (machine master)."
    )
  })

  it("updates status metadata while retaining the exact unchanged dashboard payload", () => {
    const dashboard = {
      productionFloorCode: "cnc",
      readModelVersion: 7,
      rows: ["CNC-1"],
    }
    const currentData = {
      coverage: partialCoverage,
      dashboard,
      productionFloorCode: "cnc",
      status: { status: "queued" },
      version: 7,
    }
    const action = dashboardDeliveryResponseAction({
      atMs: 2_000,
      currentData,
      request: { floor: "cnc", knownVersion: 7, requestId: 2 },
      response: {
        coverage: null,
        dashboard: null,
        notModified: true,
        productionFloorCode: "cnc",
        status: { isRefreshing: true, status: "running" },
        version: 7,
      },
    })

    expect(action).toMatchObject({
      type: "state.not-modified",
      refresh: "running",
      version: 7,
    })
    expect(action.data).not.toBe(currentData)
    expect(action.data.dashboard).toBe(dashboard)
    expect(action.data.status).toEqual({
      isRefreshing: true,
      status: "running",
    })
  })

  it("carries durable refresh failures as stale delivery evidence", () => {
    const action = dashboardDeliveryResponseAction({
      atMs: 3_000,
      currentData: null,
      request: { floor: "forging", knownVersion: null, requestId: 3 },
      response: {
        dashboard: {
          productionFloorCode: "forging",
          readModelVersion: 4,
        },
        notModified: false,
        productionFloorCode: "forging",
        status: {
          isRefreshing: false,
          lastError: "Worker exhausted retries",
          status: "failed",
        },
        version: 4,
      },
    })

    expect(action).toMatchObject({
      refresh: "failed",
      refreshError: "Worker exhausted retries",
    })
  })

  it("presents retained reconnecting data without claiming it is current", () => {
    const initial = createDashboardDeliveryState<{ dashboard: object }>("cnc")
    const started = dashboardDeliveryReducer(initial, {
      type: "request.started",
      floor: "cnc",
      requestId: 1,
    })
    const loaded = dashboardDeliveryReducer(started, {
      type: "state.changed",
      atMs: 1_000,
      coverage: "complete",
      data: { dashboard: {} },
      floor: "cnc",
      refresh: "idle",
      requestId: 1,
      version: 1,
    })
    const retrying = dashboardDeliveryReducer(loaded, {
      type: "connection.lost",
    })

    expect(dashboardConnectionLabel(initial)).toBe("Loading")
    expect(dashboardConnectionLabel(retrying)).toBe("Reconnecting")
    expect(dashboardDeliveryNotice(retrying)).toBe(
      "Reconnecting to live updates. Showing the last successful dashboard."
    )
  })

  it("presents refresh failure evidence alongside retained data", () => {
    const initial = createDashboardDeliveryState<{ dashboard: object }>("cnc")
    const started = dashboardDeliveryReducer(initial, {
      type: "request.started",
      floor: "cnc",
      requestId: 1,
    })
    const loaded = dashboardDeliveryReducer(started, {
      type: "state.changed",
      atMs: 1_000,
      coverage: "complete",
      data: { dashboard: {} },
      floor: "cnc",
      refresh: "idle",
      requestId: 1,
      version: 1,
    })
    const failed = dashboardDeliveryReducer(loaded, {
      type: "refresh.failed",
      message: "Worker exhausted retries.",
    })

    expect(dashboardConnectionLabel(failed)).toBe("Stale")
    expect(dashboardDeliveryNotice(failed)).toBe(
      "Worker exhausted retries. Showing the last successful dashboard."
    )
  })
})
