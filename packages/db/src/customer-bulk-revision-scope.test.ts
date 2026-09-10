import type { Pool, PoolClient } from "pg"
import { expect, test, vi } from "vitest"
import { createCommercialRevisionsRepository } from "./commercial-revisions"

test.each([
  {
    label: "all customers",
    allCustomers: true,
    customerId: null,
    companyName: null,
    valid: true,
  },
  {
    label: "one customer",
    allCustomers: false,
    customerId: "customer-1",
    companyName: "Test Customer",
    valid: true,
  },
  {
    label: "empty selection",
    allCustomers: false,
    customerId: null,
    companyName: null,
    valid: false,
  },
])(
  "creates the requested scope: $label",
  async ({ allCustomers, customerId, companyName, valid }) => {
    let saved: Record<string, unknown> | undefined
    const query = vi.fn(
      async (sql: string, values: readonly unknown[] = []) => {
        if (sql.includes("SELECT id FROM sales.customers")) {
          return {
            rows:
              values[0] === "customer-1" && values[1] === "org-1"
                ? [{ id: "customer-1" }]
                : [],
          }
        }
        if (sql.includes("INSERT INTO core.number_sequences"))
          return { rows: [{ current_value: "1" }] }
        if (sql.includes("INSERT INTO sales.bulk_price_revisions")) {
          saved = {
            id: "revision-1",
            revision_number: values[1],
            reason: values[2],
            effective_on: values[3],
            company_name: values[4] === null ? null : "Test Customer",
            revision_route: values[5],
            status: "Pending Costing",
            change_count: "0",
            revised_quote_count: "0",
          }
          return { rows: [saved] }
        }
        if (sql.includes("FROM sales.bulk_price_revisions revision"))
          return { rows: saved ? [saved] : [] }
        return { rows: [], rowCount: 1 }
      }
    )
    const client = { query, release: vi.fn() } as unknown as PoolClient
    const repository = createCommercialRevisionsRepository({
      pool: { query, connect: vi.fn(async () => client) } as unknown as Pool,
    })
    const selection = { allCustomers, customerId }
    const creation = repository.createBulkPriceRevision({
      ...selection,
      organizationId: "org-1",
      effectiveOn: "2026-09-10",
      reason: "Review customer costs",
      revisionRoute: "Customer Parameter Bulk Revision",
    })
    if (!valid) {
      await expect(creation).rejects.toThrow("Customer is required")
      expect(await repository.listBulkPriceRevisions("MRMPL")).toEqual([])
      return
    }
    await expect(creation).resolves.toMatchObject({
      id: "revision-1",
      status: "Pending Costing",
    })
    expect(await repository.listBulkPriceRevisions("MRMPL")).toMatchObject([
      {
        companyName,
        revisionRoute: "Customer Parameter Bulk Revision",
        status: "Pending Costing",
        revisedQuoteCount: 0,
      },
    ])
  }
)
