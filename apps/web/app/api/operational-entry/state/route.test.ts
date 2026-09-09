import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const dependencies = vi.hoisted(() => ({
  close: vi.fn(),
  getSession: vi.fn(),
  listAllGrantedCapabilities: vi.fn(),
  organizationIdForCode: vi.fn(),
  state: vi.fn(),
}))

vi.mock("@workspace/db", () => ({
  createAuthorizationRepository: () => ({
    listAllGrantedCapabilities: dependencies.listAllGrantedCapabilities,
  }),
  createDashboardReadModelRepository: () => ({
    close: dependencies.close,
    organizationIdForCode: dependencies.organizationIdForCode,
    state: dependencies.state,
  }),
}))

vi.mock("@/lib/auth/auth", () => ({
  getAuth: () => ({ api: { getSession: dependencies.getSession } }),
  readAuthEnvironment: () => ({ connectionString: "postgres://test" }),
}))
vi.mock("../../../../lib/auth/auth", () => ({
  getAuth: () => ({ api: { getSession: dependencies.getSession } }),
  readAuthEnvironment: () => ({ connectionString: "postgres://test" }),
}))

vi.mock("@/lib/postgres-runtime", () => ({
  getWebPostgresPool: () => ({ query: vi.fn() }),
}))
vi.mock("../../../../lib/postgres-runtime", () => ({
  getWebPostgresPool: () => ({ query: vi.fn() }),
}))

// Vitest does not resolve the app's @ alias; keep these route dependencies real.
vi.mock(
  "@/lib/auth/operational-entry-capabilities",
  () => import("../../../../lib/auth/operational-entry-capabilities")
)
vi.mock(
  "@/lib/auth/operational-entry-access",
  () => import("../../../../lib/auth/operational-entry-access")
)
vi.mock(
  "@/lib/postgres-dashboard-read-server",
  () => import("../../../../lib/postgres-dashboard-read-server")
)

vi.mock("@/lib/production-module", () => ({
  productionModuleIsEnabled: () => true,
}))

import { GET } from "./route"

function request(entry = "work_order", floor = "cnc") {
  return new NextRequest(
    `http://localhost/api/operational-entry/state?entry=${entry}&floor=${floor}`
  )
}

describe("operational-entry state API", () => {
  beforeEach(() => {
    for (const mock of Object.values(dependencies)) mock.mockReset()
    vi.spyOn(console, "info").mockImplementation(() => undefined)
    dependencies.getSession.mockResolvedValue({ user: { id: "entry-reader" } })
    dependencies.listAllGrantedCapabilities.mockResolvedValue([])
    dependencies.organizationIdForCode.mockResolvedValue("organization-1")
  })

  afterEach(() => vi.restoreAllMocks())

  it("rejects unauthenticated and out-of-scope requests before loading records", async () => {
    dependencies.getSession.mockResolvedValue(null)
    expect((await GET(request())).status).toBe(401)

    dependencies.getSession.mockResolvedValue({ user: { id: "entry-reader" } })
    for (const granted of [
      ["operations.dashboard.read", "operations.operational_entry.read"],
      ["entries.forging.work_order.read"],
      ["entries.cnc.rm_inward.read"],
      ["entries.cnc.work_order.save"],
    ]) {
      dependencies.listAllGrantedCapabilities.mockResolvedValue(granted)
      const response = await GET(request())
      expect(response.status).toBe(403)
      expect(response.headers.get("Cache-Control")).toBe("no-store")
    }
    expect(dependencies.state).not.toHaveBeenCalled()
    expect(dependencies.organizationIdForCode).not.toHaveBeenCalled()
  })

  it("serves the leaf grant's saved and projected rows without other entry or unit data", async () => {
    dependencies.listAllGrantedCapabilities.mockResolvedValue([
      "entries.cnc.work_order.read",
    ])
    const selected = {
      entryType: "work_order",
      productionFloorCode: "cnc",
      jcNo: "WO-CNC-1",
    }
    dependencies.state.mockResolvedValue({
      version: 9,
      status: { isRefreshing: false },
      dashboard: {
        readModelVersion: 9,
        dataEntry: {
          rows: [
            selected,
            { ...selected, productionFloorCode: "forging" },
            { entryType: "rm_inward", productionFloorCode: "cnc" },
          ],
        },
        productionControl: {
          workOrders: [
            selected,
            { ...selected, productionFloorCode: "forging" },
          ],
          rmInwardRows: [{ rmPoNo: "unrelated-receipt" }],
          machineRows: [{ machine: "unrelated-machine" }],
        },
        employeeMaster: [{ name: "Unrelated employee" }],
      },
    })

    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.json()).toEqual({
      productionFloorCode: "cnc",
      version: 9,
      notModified: false,
      coverage: null,
      status: { isRefreshing: false },
      dashboard: {
        readModelVersion: 9,
        productionFloorCode: "cnc",
        dataEntry: { entryTypes: ["work_order"], rows: [selected] },
        productionControl: { workOrders: [selected] },
      },
    })
    expect(dependencies.state).toHaveBeenCalledWith("organization-1", {}, "cnc")
    expect(dependencies.close).toHaveBeenCalledOnce()
  })
})
