import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

const migrationUrl = new URL(
  "../migrations/0105_supplier_material_rates.sql",
  import.meta.url
)

type SupplierRate = [string, string, string, number | null, number]

const expectedRates: SupplierRate[] = [
  ["C3604", "C3604", "SOLID", 7, 26],
  ["C3604", "C3604", "SOLID STRAIGHT KNURLING", 7, 31],
  ["C3604", "C3604", "SOLID DIAMOND KNURLING", 7, 36],
  ["C3604", "C3604", "HOLLOW", 7, 36],
  ["C3604", "C3604", "HOLLOW STRAIGHT KNURLING", 7, 41],
  ["C3604", "C3604", "HOLLOW DIAMOND KNURLING", 7, 46],
  ["C3604", "C3604", "SECTION", 7, 33],
  ["C37700", "C37700", "SOLID", 18, 26],
  ["C37700", "C37700", "SOLID STRAIGHT KNURLING", 18, 31],
  ["C37700", "C37700", "SOLID DIAMOND KNURLING", 18, 36],
  ["C37700", "C37700", "HOLLOW", 18, 36],
  ["C37700", "C37700", "HOLLOW STRAIGHT KNURLING", 18, 41],
  ["C37700", "C37700", "HOLLOW DIAMOND KNURLING", 18, 46],
  ["C37700", "C37700", "SECTION", 18, 33],
  ["C36000", "CDA-360", "SOLID", 36, 26],
  ["C36000", "CDA-360", "SOLID STRAIGHT KNURLING", 36, 31],
  ["C36000", "CDA-360", "SOLID DIAMOND KNURLING", 36, 36],
  ["C36000", "CDA-360", "HOLLOW", 36, 36],
  ["C36000", "CDA-360", "HOLLOW STRAIGHT KNURLING", 36, 46],
  ["C36000", "CDA-360", "HOLLOW DIAMOND KNURLING", 36, 51],
  ["C36000", "CDA-360", "SECTION", 36, 36],
  ["HPB59-1", "HPB59-1", "SOLID", 10, 26],
  ["HPB59-1", "HPB59-1", "SOLID STRAIGHT KNURLING", 10, 31],
  ["HPB59-1", "HPB59-1", "SOLID DIAMOND KNURLING", 10, 36],
  ["HPB59-1", "HPB59-1", "HOLLOW", 10, 36],
  ["HPB59-1", "HPB59-1", "HOLLOW STRAIGHT KNURLING", 10, 41],
  ["HPB59-1", "HPB59-1", "HOLLOW DIAMOND KNURLING", 10, 46],
  ["HPB59-1", "HPB59-1", "SECTION", 10, 36],
  ["CW510L", "LF-CW510L", "SOLID", null, 35],
  ["CW510L", "LF-CW510L", "HOLLOW", null, 50],
  ["CW510L", "LF-CW510L", "SECTION", null, 45],
  ["C46500", "C46500", "SOLID", null, 40],
  ["C46500", "C46500", "HOLLOW", null, 55],
  ["C46500", "C46500", "SECTION", null, 50],
  ["C69300", "C69300", "SOLID", null, 100],
  ["CuZn37", "LF-CuZn37", "PIPE", null, 135],
]

function parseSupplierRates(sql: string): SupplierRate[] {
  return [...sql.matchAll(/\('([^']+)', '([^']+)', '([^']+)', (NULL|\d+), (\d+)\)/g)].map(
    (match) => [
      match[1]!,
      match[2]!,
      match[3]!,
      match[4] === "NULL" ? null : Number(match[4]),
      Number(match[5]),
    ]
  )
}

describe("supplier Material Rates migration", () => {
  it("stores the complete editable supplier matrix without inventing market premiums", async () => {
    const migration = await readFile(migrationUrl, "utf8")

    expect(parseSupplierRates(migration)).toEqual(expectedRates)
    expect(migration).toMatch(/ALTER COLUMN alloy_premium DROP NOT NULL/i)
    expect(migration).toMatch(/DATE '2026-05-05'/)
    expect(migration).toMatch(/DATE '2027-03-31'/)
    expect(migration).toMatch(/ON CONFLICT \(organization_id, material_grade_id, rod_type_id\)/i)
  })
})
