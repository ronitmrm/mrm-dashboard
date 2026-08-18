import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createMasterDataLifecycleRepository } from "./master-data-lifecycle"
import { migrateDatabase } from "./migrate"
import { createStoreRepository } from "./store"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const lifecycle = createMasterDataLifecycleRepository({ connectionString })
const store = createStoreRepository({ connectionString })
let organizationId: string

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const organization = await pool.query<{ id: string }>(
    `INSERT INTO core.organizations (code, name)
     VALUES ('MRMPL', 'MRM Private Limited')
     ON CONFLICT (lower(code)) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`
  )
  organizationId = organization.rows[0]!.id
})

afterAll(async () => {
  await lifecycle.close()
  await store.close()
  await pool.end()
})

describe("Master Data lifecycle", () => {
  test("deletes an unused master and replaces a referenced duplicate", async () => {
    const suffix = randomUUID().slice(0, 8)
    const duplicate = await store.createAssetCategory({
      name: `Duplicate ${suffix}`,
      organizationId,
    })
    const replacement = await store.createAssetCategory({
      name: `Replacement ${suffix}`,
      organizationId,
    })
    await store.createAssetSubcategory({
      categoryId: duplicate.id,
      name: `Child ${suffix}`,
      organizationId,
    })

    await expect(
      lifecycle.deleteMaster({
        kind: "store_category",
        organizationId,
        reason: "Remove duplicate",
        recordId: duplicate.id,
      })
    ).rejects.toThrow("Select a replacement")

    await lifecycle.deleteMaster({
      kind: "store_category",
      organizationId,
      reason: "Merge duplicate",
      recordId: duplicate.id,
      replacementRecordId: replacement.id,
    })

    const masters = await store.listAssetClassificationMasters(organizationId)
    expect(masters.categories.map((row) => row.id)).not.toContain(duplicate.id)
    expect(
      masters.subcategories.find((row) => row.name === `Child ${suffix}`)
        ?.categoryId
    ).toBe(replacement.id)

    const unused = await store.createAssetCategory({
      name: `Unused ${suffix}`,
      organizationId,
    })
    await lifecycle.deleteMaster({
      kind: "store_category",
      organizationId,
      reason: "Unused test master",
      recordId: unused.id,
    })
    expect(
      (await store.listAssetClassificationMasters(organizationId)).categories
        .map((row) => row.id)
    ).not.toContain(unused.id)
  })
})
