import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

import { describe, expect, test } from "vitest"

type Fixture = {
  activePriceCollision: {
    customerPartCode: string
    expectedSupersededQuoteIds: string[]
  }
  bom: Array<{
    childItemId: string
    parentItemId: string
    quantity: number
  }>
  ecn: { expectedAffectedQuoteIds: string[] }
  expectedSha256: string
  items: Array<{ id: string; productType: string; uid: string }>
  poMatch: {
    candidateQuoteIdsInSourceRankOrder: string[]
    expectedQuoteId: string
  }
  quoteSnapshots: Array<{
    childQuoteId: string
    parentQuoteId: string
    quantity: number
  }>
}

describe("deterministic Pricing PostgreSQL parity fixture", () => {
  const raw = readFileSync(
    new URL("./test-fixtures/pricing-workflow.json", import.meta.url),
    "utf8"
  )
  const fixture = JSON.parse(raw) as Fixture

  test("contains List, Package, and nested Assembly identities", () => {
    expect(fixture.items.map(({ productType }) => productType).sort()).toEqual([
      "Assembly",
      "List",
      "Package",
    ])
    expect(fixture.bom).toEqual([
      {
        childItemId: "20000000-0000-4000-8000-000000000003",
        parentItemId: "20000000-0000-4000-8000-000000000001",
        quantity: 2,
      },
      {
        childItemId: "20000000-0000-4000-8000-000000000002",
        parentItemId: "20000000-0000-4000-8000-000000000003",
        quantity: 3,
      },
    ])
  })

  test("freezes immediate-child quote snapshots and recursive affected prices", () => {
    expect(fixture.quoteSnapshots).toHaveLength(2)
    expect(fixture.ecn.expectedAffectedQuoteIds).toEqual([
      "30000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000003",
      "30000000-0000-4000-8000-000000000002",
    ])
  })

  test("freezes current executable active-price and PO ranking decisions", () => {
    expect(fixture.activePriceCollision).toMatchObject({
      customerPartCode: "32046",
      expectedSupersededQuoteIds: [
        "30000000-0000-4000-8000-000000000004",
        "30000000-0000-4000-8000-000000000005",
      ],
    })
    expect(fixture.poMatch.expectedQuoteId).toBe(
      fixture.poMatch.candidateQuoteIdsInSourceRankOrder[0]
    )
  })

  test("has an immutable canonical payload digest", () => {
    const { expectedSha256, ...payload } = fixture
    expect(
      createHash("sha256").update(JSON.stringify(payload)).digest("hex")
    ).toBe(expectedSha256)
  })
})
