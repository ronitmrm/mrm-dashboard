import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const dependencies = vi.hoisted(() => ({
  close: vi.fn(),
  getSession: vi.fn(),
  listAllGrantedCapabilities: vi.fn(),
  organizationIdForCode: vi.fn(),
  upsertRawMaterialReceipt: vi.fn(),
  upsertRawMaterialReceipts: vi.fn(),
}))

vi.mock("@workspace/db", async (importOriginal) => ({
  DuplicateMasterError: (await importOriginal<typeof import("@workspace/db")>()).DuplicateMasterError,
  createAuthorizationRepository: () => ({
    listAllGrantedCapabilities: dependencies.listAllGrantedCapabilities,
  }),
  createProductionShopFloorRepository: () => ({
    close: dependencies.close,
    organizationIdForCode: dependencies.organizationIdForCode,
    upsertRawMaterialReceipt: dependencies.upsertRawMaterialReceipt,
    upsertRawMaterialReceipts: dependencies.upsertRawMaterialReceipts,
  }),
}))

vi.mock("@/lib/auth/auth", () => ({
  getAuth: () => ({ api: { getSession: dependencies.getSession } }),
  readAuthEnvironment: () => ({ connectionString: "postgres://test" }),
}))
vi.mock("../../lib/auth/auth", () => ({
  getAuth: () => ({ api: { getSession: dependencies.getSession } }),
  readAuthEnvironment: () => ({ connectionString: "postgres://test" }),
}))
vi.mock("../../lib/postgres-runtime", () => ({
  getWebPostgresPool: () => ({ query: vi.fn() }),
}))
vi.mock("@/lib/production-module", () => ({
  productionModuleIsEnabled: () => true,
}))

// Keep route policies and scope authorization real across the app's @ alias.
vi.mock(
  "@/lib/dashboard-api-policy",
  () => import("../../lib/dashboard-api-policy")
)
vi.mock(
  "@/lib/dashboard-planning-input",
  () => import("../../lib/dashboard-planning-input")
)
vi.mock(
  "@/lib/planning-master-import",
  () => import("../../lib/planning-master-import")
)
vi.mock(
  "@/lib/planning-refresh-policy",
  () => import("../../lib/planning-refresh-policy")
)
vi.mock(
  "@/lib/postgres-dashboard-read-server",
  () => import("../../lib/postgres-dashboard-read-server")
)

vi.mock("@/lib/postgres-operational-entry-server", () => ({
  isPostgresOperationalEntryType: () => false,
  OperationalEntryError: class OperationalEntryError extends Error {
    status = 500
  },
}))

import { POST } from "./[...path]/route"

function post(
  path: "data-entry" | "data-import",
  body: Record<string, unknown>
) {
  return POST(
    new NextRequest(`http://localhost/api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ path: [path] }) }
  )
}

function importBody(
  csv = "rmPoNo,rmInwardKg,rmInwardDate\nRM-1,12,2026-09-09\n"
) {
  return {
    entryType: "rm_inward",
    productionFloorCode: "cnc",
    fileName: "rm_inward.csv",
    fileBase64: Buffer.from(csv).toString("base64"),
  }
}

describe("production entry mutation API authorization", () => {
  beforeEach(() => {
    for (const mock of Object.values(dependencies)) mock.mockReset()
    vi.spyOn(console, "info").mockImplementation(() => undefined)
    dependencies.getSession.mockResolvedValue({ user: { id: "entry-writer" } })
    dependencies.listAllGrantedCapabilities.mockResolvedValue([])
    dependencies.organizationIdForCode.mockResolvedValue("organization-1")
    dependencies.upsertRawMaterialReceipt.mockResolvedValue({ ok: true })
    dependencies.upsertRawMaterialReceipts.mockResolvedValue({ ok: true })
  })

  afterEach(() => vi.restoreAllMocks())

  it("requires authentication and the matching action, entry and unit before either mutation", async () => {
    dependencies.getSession.mockResolvedValue(null)
    expect(
      (
        await post("data-entry", {
          entryType: "rm_inward",
          productionFloorCode: "cnc",
        })
      ).status
    ).toBe(401)
    dependencies.getSession.mockResolvedValue({ user: { id: "entry-writer" } })

    for (const path of ["data-entry", "data-import"] as const) {
      for (const entryType of ["work_order", "rm_inward", "software_raw"]) {
        const action = path === "data-entry" ? "save" : "import"
        for (const granted of [
          ["operations.shop_floor.write", "operations.production.write"],
          [`entries.cnc.${entryType}.read`],
          [`entries.forging.${entryType}.${action}`],
          [
            `entries.cnc.${entryType === "work_order" ? "rm_inward" : "work_order"}.${action}`,
          ],
          [`entries.cnc.${entryType}.${action === "save" ? "import" : "save"}`],
        ]) {
          dependencies.listAllGrantedCapabilities.mockResolvedValue(granted)
          expect(
            (await post(path, { entryType, productionFloorCode: "cnc" })).status
          ).toBe(403)
        }
      }
    }
    expect(dependencies.organizationIdForCode).not.toHaveBeenCalled()
    expect(dependencies.upsertRawMaterialReceipt).not.toHaveBeenCalled()
    expect(dependencies.upsertRawMaterialReceipts).not.toHaveBeenCalled()
  })

  it("saves and imports with their separate leaf actions without legacy write permissions", async () => {
    dependencies.listAllGrantedCapabilities.mockResolvedValue([
      "entries.cnc.rm_inward.read",
      "entries.cnc.rm_inward.save",
    ])
    const saved = await post("data-entry", {
      entryType: "rm_inward",
      productionFloorCode: "cnc",
      payload: { rmPoNo: "RM-1", rmInwardKg: 12, rmInwardDate: "2026-09-09" },
    })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ ok: true, rowsUpdated: 1 })
    expect(dependencies.upsertRawMaterialReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        productionFloorCode: "cnc",
        requiredProductionFloorCode: "cnc",
        quantityKg: 12,
      })
    )

    dependencies.listAllGrantedCapabilities.mockResolvedValue([
      "entries.cnc.rm_inward.read",
      "entries.cnc.rm_inward.import",
    ])
    const imported = await post("data-import", importBody())
    expect(imported.status).toBe(200)
    expect(await imported.json()).toMatchObject({ ok: true, inserted: 1 })
    expect(dependencies.upsertRawMaterialReceipts).toHaveBeenCalledWith([
      expect.objectContaining({
        productionFloorCode: "cnc",
        requiredProductionFloorCode: "cnc",
        quantityKg: 12,
      }),
    ])
  })

  it("rejects a different unit inside manual and imported payloads", async () => {
    dependencies.listAllGrantedCapabilities.mockResolvedValue([
      "entries.cnc.rm_inward.save",
      "entries.cnc.rm_inward.import",
    ])
    const manual = await post("data-entry", {
      entryType: "rm_inward",
      productionFloorCode: "cnc",
      payload: {
        productionFloorCode: "forging",
        rmPoNo: "RM-1",
        rmInwardKg: 12,
      },
    })
    expect(manual.status).toBe(400)
    const imported = await post(
      "data-import",
      importBody("productionFloorCode,rmPoNo,rmInwardKg\nforging,RM-1,12\n")
    )
    expect(imported.status).toBe(400)
    expect(dependencies.upsertRawMaterialReceipt).not.toHaveBeenCalled()
    expect(dependencies.upsertRawMaterialReceipts).not.toHaveBeenCalled()
  })
})
