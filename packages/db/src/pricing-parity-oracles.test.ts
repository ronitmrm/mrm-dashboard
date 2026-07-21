import { readFileSync } from "node:fs"

import { describe, expect, test } from "vitest"

import {
  pricingLogicDecisions,
  pricingOutputOracles,
  pricingRegressionOracles,
  pricingWorkflowAuditOracles,
} from "./pricing-parity-oracles"

describe("Pricing logic migration oracle accounting", () => {
  test("accounts for every executable source regression and formula oracle", () => {
    expect(pricingRegressionOracles).toHaveLength(46)
    expect(new Set(pricingRegressionOracles.map(({ id }) => id)).size).toBe(46)
    expect(
      pricingRegressionOracles.every(
        ({ sourceOracle, targetTestId, ticket }) =>
          sourceOracle.length > 0 &&
          targetTestId.startsWith("PR-") &&
          /^LM-\d{2}$/.test(ticket)
      )
    ).toBe(true)
  })

  test("accounts for every workflow data check, including the duplicated source id", () => {
    expect(pricingWorkflowAuditOracles).toHaveLength(57)
    expect(
      new Set(
        pricingWorkflowAuditOracles.map(({ targetTestId }) => targetTestId)
      ).size
    ).toBe(57)
    expect(
      pricingWorkflowAuditOracles.filter(
        ({ sourceCheckId }) => sourceCheckId === "PACKAGE-010"
      )
    ).toHaveLength(2)
  })

  test("freezes all source output families behind deterministic golden metadata", () => {
    expect(pricingOutputOracles.map(({ family }) => family)).toEqual([
      "master-workbook",
      "enquiry-import-template",
      "enquiry-register",
      "enquiry-lines",
      "sales-history",
      "quote-pdf",
      "pricing-current",
      "pricing-revisions",
      "po-template",
      "po-detail",
      "po-master",
      "pi-document",
      "pi-master",
      "drawing-history",
      "website-products",
    ])
    expect(
      pricingOutputOracles.every(({ goldenFixture }) => goldenFixture)
    ).toBe(true)

    const fixture = JSON.parse(
      readFileSync(
        new URL(
          "./test-fixtures/pricing-output/manifest.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as {
      outputs: Array<{
        contentType: string
        family: string
        filenamePattern: string
        sourceRoutes: string[]
      }>
    }
    expect(fixture.outputs.map(({ family }) => family)).toEqual(
      pricingOutputOracles.map(({ family }) => family)
    )
    expect(
      fixture.outputs.every(
        ({ contentType, filenamePattern, sourceRoutes }) =>
          contentType.length > 0 &&
          filenamePattern.length > 0 &&
          sourceRoutes.length > 0
      )
    ).toBe(true)
  })

  test("records no-functional-change decisions before schema or matcher changes", () => {
    expect(pricingLogicDecisions).toMatchObject({
      activePriceSupersession: "customer-and-normalized-code",
      ambiguousPurchaseOrderMatch: "deterministic-ranked-source-match",
      derivedProductStoredCost: "machining-price-per-piece",
      quotePdfMarketRates: "live-no-store-with-source-fallbacks",
      redisAuthority: "disposable",
    })
  })
})
