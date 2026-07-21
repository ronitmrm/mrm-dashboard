import { describe, expect, test } from "vitest"

import {
  combineTableFingerprints,
  type TableFingerprint,
} from "./database-fingerprint"

const tables: TableFingerprint[] = [
  { schema: "core", table: "organizations", rowCount: 1, digest: "aaa" },
  { schema: "catalog", table: "items", rowCount: 10, digest: "bbb" },
]

describe("database fingerprint", () => {
  test("is stable across table discovery order and changes with table data", () => {
    const expected = combineTableFingerprints(tables)

    expect(expected).toMatch(/^[a-f0-9]{64}$/)
    expect(combineTableFingerprints([...tables].reverse())).toBe(expected)
    expect(
      combineTableFingerprints([
        tables[0]!,
        { ...tables[1]!, digest: "changed" },
      ])
    ).not.toBe(expected)
  })
})
