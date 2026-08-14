import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createCustomerRepository } from "./customers"
import { migrateDatabase } from "./migrate"
import { createProductRepository } from "./products"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const customers = createCustomerRepository({ connectionString })
const products = createProductRepository({ connectionString })

let emptyOrganizationCode: string
let exactOrganizationCode: string
let pagedOrganizationCode: string

async function createOrganization(code: string, name: string) {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, $2)
      RETURNING id
    `,
    [code, name]
  )
  return result.rows[0]!.id
}

async function seedCustomers(organizationId: string, count: number) {
  await pool.query(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name, source_system,
        source_table, source_id
      )
      SELECT $1, 'C' || lpad(value::text, 3, '0'),
        CASE
          WHEN value = $2 THEN 'Needle customer C001 distributor'
          ELSE 'Customer ' || lpad(value::text, 3, '0')
        END,
        'test', 'commercial_master_pagination', $3 || ':' || value::text
      FROM generate_series(1, $2) value
    `,
    [organizationId, count, randomUUID()]
  )
}

async function seedProducts(organizationId: string, count: number) {
  await pool.query(
    `
      INSERT INTO catalog.items (
        organization_id, uid, description, item_type, source_system,
        source_table, source_id
      )
      SELECT $1, 'P' || lpad(value::text, 3, '0'),
        CASE
          WHEN value = $2 THEN 'Needle product compatible with P001'
          ELSE 'Product ' || lpad(value::text, 3, '0')
        END,
        CASE WHEN value = $2 THEN 'Package' ELSE 'List' END,
        'test', 'commercial_master_pagination', $3 || ':' || value::text
      FROM generate_series(1, $2) value
    `,
    [organizationId, count, randomUUID()]
  )
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const suffix = randomUUID()
  emptyOrganizationCode = `EMPTY-${suffix}`
  exactOrganizationCode = `EXACT-${suffix}`
  pagedOrganizationCode = `PAGED-${suffix}`

  await createOrganization(emptyOrganizationCode, "Empty commercial masters")
  const exactOrganizationId = await createOrganization(
    exactOrganizationCode,
    "Exact commercial masters"
  )
  const pagedOrganizationId = await createOrganization(
    pagedOrganizationCode,
    "Paged commercial masters"
  )

  await seedCustomers(exactOrganizationId, 15)
  await seedProducts(exactOrganizationId, 25)
  await seedCustomers(pagedOrganizationId, 53)
  await seedProducts(pagedOrganizationId, 53)
  await pool.query(
    `
      INSERT INTO sales.customers (
        organization_id, customer_uid, company_name, source_system,
        source_table, source_id
      )
      VALUES ($1, 'Z', 'Short exact A%_ customer', 'test',
        'commercial_master_pagination', $2)
    `,
    [pagedOrganizationId, randomUUID()]
  )
  await pool.query(
    `
      INSERT INTO catalog.items (
        organization_id, uid, description, source_system, source_table,
        source_id
      )
      VALUES ($1, 'Z', 'Short exact A%_ product', 'test',
        'commercial_master_pagination', $2)
    `,
    [pagedOrganizationId, randomUUID()]
  )
})

afterAll(async () => {
  await Promise.all([customers.close(), products.close()])
  await pool.end()
})

describe("commercial master repository pagination", () => {
  test("returns exact empty and full-page customer totals", async () => {
    await expect(
      customers.listPageForOrganization(emptyOrganizationCode, {
        limit: 15,
        offset: 0,
      })
    ).resolves.toEqual({
      coverage: { limit: 15, returned: 0, total: 0, truncated: false },
      rows: [],
    })

    const exactPage = await customers.listPageForOrganization(
      exactOrganizationCode,
      { limit: 15, offset: 0 }
    )
    expect(exactPage.coverage).toEqual({
      limit: 15,
      returned: 15,
      total: 15,
      truncated: false,
    })
    expect(exactPage.rows.map((customer) => customer.customerUid)).toEqual(
      Array.from(
        { length: 15 },
        (_, index) => `C${String(index + 1).padStart(3, "0")}`
      )
    )
  })

  test("returns the next customer page in stable UID and ID order", async () => {
    const page = await customers.listPageForOrganization(
      pagedOrganizationCode,
      { limit: 15, offset: 15 }
    )

    expect(page.coverage).toEqual({
      limit: 15,
      returned: 15,
      total: 54,
      truncated: true,
    })
    expect(page.rows.map((customer) => customer.customerUid)).toEqual(
      Array.from(
        { length: 15 },
        (_, index) => `C${String(index + 16).padStart(3, "0")}`
      )
    )
    expect(page.rows).toEqual(
      [...page.rows].sort(
        (left, right) =>
          left.customerUid.localeCompare(right.customerUid) ||
          left.id.localeCompare(right.id)
      )
    )
  })

  test("preserves product page size, exact totals, and stable order", async () => {
    const exactPage = await products.listPageForOrganization(
      exactOrganizationCode,
      { limit: 25, offset: 0 }
    )
    expect(exactPage.coverage).toEqual({
      limit: 25,
      returned: 25,
      total: 25,
      truncated: false,
    })

    const nextPage = await products.listPageForOrganization(
      pagedOrganizationCode,
      { limit: 25, offset: 25 }
    )
    expect(nextPage.coverage).toEqual({
      limit: 25,
      returned: 25,
      total: 54,
      truncated: true,
    })
    expect(nextPage.rows.map((product) => product.uid)).toEqual(
      Array.from(
        { length: 25 },
        (_, index) => `P${String(index + 26).padStart(3, "0")}`
      )
    )
    expect(nextPage.rows).toEqual(
      [...nextPage.rows].sort(
        (left, right) =>
          left.uid.localeCompare(right.uid) || left.id.localeCompare(right.id)
      )
    )
  })
})

describe("commercial master selector search", () => {
  test("bounds blank customer selectors to 50 stable matches", async () => {
    const result = await customers.searchForOrganization(
      pagedOrganizationCode,
      ""
    )

    expect(result.coverage).toEqual({
      limit: 50,
      returned: 50,
      truncated: true,
    })
    expect(result.rows[0]?.customerUid).toBe("C001")
    expect(result.rows.at(-1)?.customerUid).toBe("C050")
  })

  test("filters customers before the selector bound and ranks exact UIDs first", async () => {
    const filtered = await customers.searchForOrganization(
      pagedOrganizationCode,
      "needle"
    )
    expect(filtered.rows.map((customer) => customer.customerUid)).toEqual([
      "C053",
    ])

    const exact = await customers.searchForOrganization(
      pagedOrganizationCode,
      "C001"
    )
    expect(exact.rows.map((customer) => customer.customerUid)).toEqual([
      "C001",
      "C053",
    ])
  })

  test("filters products before the selector bound and ranks exact UIDs first", async () => {
    const blank = await products.searchForOrganization(
      pagedOrganizationCode,
      ""
    )
    expect(blank.coverage).toEqual({
      limit: 50,
      returned: 50,
      truncated: true,
    })

    const filtered = await products.searchForOrganization(
      pagedOrganizationCode,
      "needle"
    )
    expect(filtered.rows.map((product) => product.uid)).toEqual(["P053"])

    const packages = await products.searchForOrganization(
      pagedOrganizationCode,
      "",
      { itemTypes: ["Package", "Assembly"] }
    )
    expect(packages.rows.map((product) => product.uid)).toEqual(["P053"])

    const exact = await products.searchForOrganization(
      pagedOrganizationCode,
      "P001"
    )
    expect(exact.rows.map((product) => product.uid)).toEqual(["P001", "P053"])
  })

  test("allows short exact UIDs without running contains search", async () => {
    const customer = await customers.searchForOrganization(
      pagedOrganizationCode,
      "z"
    )
    const product = await products.searchForOrganization(
      pagedOrganizationCode,
      "z"
    )

    expect(customer.rows.map((row) => row.customerUid)).toEqual(["Z"])
    expect(product.rows.map((row) => row.uid)).toEqual(["Z"])
  })

  test("treats SQL wildcard characters as selector search text", async () => {
    const customer = await customers.searchForOrganization(
      pagedOrganizationCode,
      "A%_"
    )
    const product = await products.searchForOrganization(
      pagedOrganizationCode,
      "A%_"
    )

    expect(customer.rows.map((row) => row.customerUid)).toEqual(["Z"])
    expect(product.rows.map((row) => row.uid)).toEqual(["Z"])
  })
})
