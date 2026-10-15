import type { Pool } from "pg"
import { expect, test, vi } from "vitest"
import {
  createPortfolioEntryRepository,
  type PortfolioEntryInput,
} from "./portfolio-entry"

const part: PortfolioEntryInput = {
  actorUserId: "actor",
  organizationCode: "MRMPL",
  uid: "M855",
  itemType: "List",
  productSize: "1/4",
  category: "Fittings",
  subcategory: "Hose",
  productType: "Barstock",
  productionType: "CNC",
  grade: "Brass",
  rodType: "Round",
  rodSize: "12",
  pieceWeight: 10,
  blankPieceWeight: 12,
  processesRequired: ["Machining"],
  components: [],
}
function fixture(duplicate = false) {
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("FROM core.organizations"))
      return { rows: [{ id: "org" }] }
    if (sql.includes("AS next_value")) return { rows: [{ next_value: "900" }] }
    if (sql.startsWith("SELECT id FROM catalog.items"))
      return { rows: duplicate ? [{ id: "existing" }] : [] }
    if (sql.includes("AS valid"))
      return {
        rows: [
          {
            valid: true,
            grade_id: "grade",
            rod_type_id: "rod",
            machine_type_id: "machine",
              rod_size_valid: true,
          },
        ],
      }
    if (sql.includes("FOR SHARE"))
      return { rows: [{ id: values[1], uid: values[1], weight_100_pcs: "10" }] }
    return { rows: [] }
  })
  const release = vi.fn()
  const pool = { connect: async () => ({ query, release }) } as unknown as Pool
  return {
    repository: createPortfolioEntryRepository({ pool }),
    query,
    release,
  }
}

test("registers a manual-UID part and an auto-UID package without any customer or quote writes", async () => {
  const { repository, query } = fixture()
  await expect(repository.create(part)).resolves.toMatchObject({ uid: "M855" })
  const saved = await repository.create({
    ...part,
    uid: "",
    itemType: "Package",
    components: [
      { uid: "M855", quantity: 2 },
      { uid: "M856", quantity: 1 },
    ],
  })
  expect(saved.uid).toBe("M900")
  const products = query.mock.calls.filter(([sql]) =>
    sql.includes("INSERT INTO catalog.items")
  )
  expect(products).toHaveLength(2)
  expect(products[1]![1]?.[10]).toBe(30)
  expect(products[1]![1]?.[16]).toContain('"portfolioEntry":true')
  const bom = query.mock.calls.filter(([sql]) =>
    sql.includes("INSERT INTO catalog.bom_lines")
  )
  expect(bom.map(([, values]) => values?.[6])).toEqual([1, 2])
  expect(query.mock.calls.some(([sql]) => sql.includes("sales."))).toBe(false)
  expect(query.mock.calls.filter(([sql]) => sql === "COMMIT")).toHaveLength(2)
})

test("rejects a duplicate UID and rolls back without overwriting the existing product", async () => {
  const { repository, query, release } = fixture(true)
  await expect(repository.create(part)).rejects.toThrow("already exists")
  expect(
    query.mock.calls.some(
      ([sql]) =>
        sql.includes("INSERT INTO catalog.items") ||
        sql.includes("UPDATE catalog.items")
    )
  ).toBe(false)
  expect(query).toHaveBeenCalledWith("ROLLBACK")
  expect(release).toHaveBeenCalledOnce()
})
