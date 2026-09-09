import { Pool, type PoolClient } from "pg"
import { afterEach, expect, test, vi } from "vitest"
import { createCommercialMasterRepository } from "./commercial-masters"
import { createStoreRepository } from "./store"
import { createDashboardPlanningRepository } from "./dashboard-planning"
import { createQualityRepository } from "./quality"
import { createRecruitmentRepository } from "./recruitment"

afterEach(() => vi.restoreAllMocks())

test("Website Field options reject case variants within the same field", async () => {
  const pool = new Pool()
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes("RETURNING id")
      ? [{ id: "new", inserted: true }]
      : [{ id: "existing" }],
  }))
  vi.spyOn(pool, "connect").mockImplementation(
    async () => ({ query, release: vi.fn() }) as unknown as PoolClient
  )
  await expect(
    createCommercialMasterRepository({ pool }).upsertNamed({
      organizationId: "organization",
      kind: "websiteField",
      fieldType: "material",
      name: " brass ",
      sortOrder: 1,
      rejectDuplicates: true,
    })
  ).rejects.toThrow(
    "This entry already exists. Please edit the existing record."
  )
  await pool.end()
})

test("a tooling save rolls back all its lines when a later tool already exists", async () => {
  const pool = new Pool()
  let toolingReads = 0
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes("FROM manufacturing.operation_tooling")
      ? ++toolingReads === 1
        ? []
        : [{ id: "existing" }]
      : [{ id: "setup", type_code: "TOOL", operation_setup_id: "setup" }],
  }))
  vi.spyOn(pool, "connect").mockImplementation(
    async () => ({ query, release: vi.fn() }) as unknown as PoolClient
  )
  const input = {
    organizationId: "organization",
    itemUid: "part",
    routeCode: "1",
    setupNumber: 1,
    productionFloorCode: "cnc",
    rejectDuplicates: true,
  }
  await expect(
    createDashboardPlanningRepository({ pool }).upsertToolingBatch([
      { ...input, toolCode: "FIRST" },
      { ...input, toolCode: "SECOND" },
    ])
  ).rejects.toThrow(
    "This entry already exists. Please edit the existing record."
  )
  expect(query).toHaveBeenCalledWith("ROLLBACK")
  expect(query).not.toHaveBeenCalledWith("COMMIT")
  await pool.end()
})

test.each([true, false])(
  "new Commercial entries still save (duplicate protection: %s)",
  async (rejectDuplicates) => {
    const pool = new Pool()
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("RETURNING id") ? [{ id: "new", inserted: true }] : [],
    }))
    vi.spyOn(pool, "connect").mockImplementation(
      async () => ({ query, release: vi.fn() }) as unknown as PoolClient
    )
    await expect(
      createCommercialMasterRepository({ pool }).upsertNamed({
        organizationId: "organization",
        kind: "rodSize",
        name: "16 Round",
        rejectDuplicates,
      })
    ).resolves.toEqual({ id: "new", inserted: true })
    expect(query).toHaveBeenCalledWith("COMMIT")
    await pool.end()
  }
)

test("master workbook imports still accept existing entries", async () => {
  const pool = new Pool()
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes("RETURNING id")
      ? [{ id: "existing", inserted: false }]
      : [],
  }))
  vi.spyOn(pool, "connect").mockImplementation(
    async () => ({ query, release: vi.fn() }) as unknown as PoolClient
  )
  await expect(
    createCommercialMasterRepository({ pool }).importSnapshot({
      organizationId: "organization",
      snapshot: {
        applications: [],
        categories: [],
        certifications: [],
        commercialTerms: [],
        customers: [],
        machineTypes: [],
        materialGrades: [],
        materialRates: [],
        packagingOptions: [],
        processes: [],
        quoteTerms: [],
        rodTypes: [],
        rodSizes: [{ name: "14.29 Hex SC" }],
        shippingTerms: [],
        subcategories: [],
        websiteFields: [],
      },
    })
  ).resolves.toMatchObject({ created: 0, updated: 1 })
  expect(query).toHaveBeenCalledWith("COMMIT")
  await pool.end()
})

test("manual HR template creation rejects an existing template name", async () => {
  const pool = new Pool()
  const query = vi.fn(async () => ({ rows: [{ id: "existing" }] }))
  vi.spyOn(pool, "connect").mockImplementation(
    async () => ({ query, release: vi.fn() }) as unknown as PoolClient
  )
  const repository = createRecruitmentRepository({ pool })
  await expect(
    repository.upsertTemplate({
      organizationId: "organization",
      name: " Turner ",
      templateCode: "NEW",
      departmentCode: "CNC",
      designationCode: "OP",
      rejectDuplicates: true,
    })
  ).rejects.toThrow(
    "This entry already exists. Please edit the existing record."
  )
  expect(query).toHaveBeenCalledWith("ROLLBACK")
  await pool.end()
})

test("manual rejection types reject the same name even with a different code", async () => {
  const pool = new Pool()
  const query = vi.fn(async () => ({
    rows: [{ id: "existing", code: "RT001" }],
  }))
  vi.spyOn(pool, "connect").mockImplementation(
    async () => ({ query, release: vi.fn() }) as unknown as PoolClient
  )
  const repository = createQualityRepository({ pool })
  await expect(
    repository.upsertRejectionType({
      organizationId: "organization",
      name: " Burr ",
      code: "RT002",
      payload: {},
      rejectDuplicates: true,
    })
  ).rejects.toThrow(
    "This entry already exists. Please edit the existing record."
  )
  expect(query).toHaveBeenCalledWith("ROLLBACK")
  await pool.end()
})

test("a duplicate manual master save fails and rolls back instead of accepting it", async () => {
  const pool = new Pool()
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes("RETURNING id")
      ? [{ id: "existing", inserted: false }]
      : [],
  }))
  vi.spyOn(pool, "connect").mockImplementation(
    async () => ({ query, release: vi.fn() }) as unknown as PoolClient
  )
  const repository = createCommercialMasterRepository({ pool })
  await expect(
    repository.upsertNamed({
      organizationId: "organization",
      kind: "rodSize",
      name: " 14.29 hex sc ",
      rejectDuplicates: true,
    })
  ).rejects.toThrow(
    "This entry already exists. Please edit the existing record."
  )
  expect(query).toHaveBeenCalledWith("ROLLBACK")
  expect(query).not.toHaveBeenCalledWith("COMMIT")
  await pool.end()
})

test("manual Setup Name saves reject an existing name in the selected unit", async () => {
  const pool = new Pool()
  const query = vi.fn(async () => ({ rows: [{ id: "existing" }] }))
  vi.spyOn(pool, "connect").mockImplementation(
    async () => ({ query, release: vi.fn() }) as unknown as PoolClient
  )
  const repository = createDashboardPlanningRepository({ pool })
  await expect(
    repository.upsertSetupName({
      organizationId: "organization",
      name: " Turning ",
      productionFloorCode: "cnc",
      rejectDuplicates: true,
    })
  ).rejects.toThrow(
    "This entry already exists. Please edit the existing record."
  )
  expect(query).toHaveBeenCalledWith("ROLLBACK")
  await pool.end()
})

test("manual Store category creation rejects a duplicate instead of reactivating it", async () => {
  const pool = new Pool()
  const query = vi.fn(async () => ({
    rows: [{ id: "existing", inserted: false }],
  }))
  vi.spyOn(pool, "query").mockImplementation(query)
  vi.spyOn(pool, "connect").mockImplementation(
    async () => ({ query, release: vi.fn() }) as unknown as PoolClient
  )
  const repository = createStoreRepository({ pool })
  await expect(
    repository.createAssetCategory({
      organizationId: "organization",
      name: " Tools ",
      rejectDuplicates: true,
    })
  ).rejects.toThrow(
    "This entry already exists. Please edit the existing record."
  )
  await pool.end()
})
