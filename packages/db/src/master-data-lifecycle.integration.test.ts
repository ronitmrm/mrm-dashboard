import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createMasterDataLifecycleRepository } from "./master-data-lifecycle"
import { createDashboardPlanningRepository } from "./dashboard-planning"
import { createCommercialMasterRepository } from "./commercial-masters"
import { migrateDatabase } from "./migrate"
import { createStoreRepository } from "./store"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const lifecycle = createMasterDataLifecycleRepository({ connectionString })
const store = createStoreRepository({ connectionString })
const planning = createDashboardPlanningRepository({ connectionString })
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
  await planning.close()
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
    const subcategory = await store.createAssetSubcategory({
      categoryId: duplicate.id,
      name: `Child ${suffix}`,
      organizationId,
    })
    const assetName = await store.createAssetName({ organizationId, subcategoryId: subcategory.id, name: suffix })
    const request = await store.createCodeRequest({
      organizationId, assetCategoryId: duplicate.id, assetSubcategoryId: subcategory.id, assetNameId: assetName.id,
      assetType: "CONSUMABLE", department: "Test", identificationName: suffix, requestedBy: "Test",
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
    expect((await pool.query(
      "SELECT requested_category FROM store.code_requests WHERE id = $1", [request.id]
    )).rows[0]?.requested_category).toBe(`Replacement ${suffix}`)

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

  test("replaces Setup Names in their own unit and synchronizes the route display", async () => {
    const name = `Setup-${randomUUID()}`
    const old = await planning.upsertSetupName({ organizationId, name })
    const replacement = await planning.upsertSetupName({ organizationId, name: `${name}-new` })
    const otherUnit = await planning.upsertSetupName({ organizationId, name, productionFloorCode: "cnc" })
    const route = await planning.upsertRouteOption({
      organizationId, itemUid: name, routeCode: "1", requireSetupNameMaster: true,
      setups: [{ operationCode: name, operationName: name, setupNumber: 1, sequence: 1 }],
      sourcePayload: { setupName: name },
    })
    const names = await pool.query<{ id: string; source_id: string }>(
      "SELECT id, source_id FROM manufacturing.setup_names WHERE id = ANY($1::uuid[])", [[old.id, replacement.id, otherUnit.id]]
    )
    const sourceId = (id: string) => names.rows.find((row) => row.id === id)!.source_id
    const deletion = { organizationId, kind: "setup_name_master" as const, recordId: sourceId(old.id), reason: "Merge duplicate" }
    await expect(lifecycle.deleteMaster({ ...deletion, replacementRecordId: sourceId(otherUnit.id) })).rejects.toThrow("same Production Unit")
    const webPool = new Pool({ connectionString, options: "-c role=mrmpl_web" })
    try {
      await createMasterDataLifecycleRepository({ pool: webPool }).deleteMaster({ ...deletion, replacementRecordId: sourceId(replacement.id) })
    } finally {
      await webPool.end()
    }
    expect((await pool.query(
      `SELECT setup_name_id, operation_name, source_payload->>'setupName' AS name
       FROM manufacturing.operation_setups WHERE route_option_id = $1`, [route.id]
    )).rows).toEqual([{ setup_name_id: replacement.id, operation_name: `${name}-new`, name: `${name}-new` }])
  })

  test("replaces customer default terms without allowing a different term type", async () => {
    const masters = createCommercialMasterRepository({ pool })
    const name = `Terms-${randomUUID()}`
    const old = await masters.upsertCommercialTerm({ organizationId, termType: "payment_terms", name })
    const next = await masters.upsertCommercialTerm({ organizationId, termType: "payment_terms", name: `${name}-new` })
    const incompatible = await masters.upsertCommercialTerm({ organizationId, termType: "shipment_mode", name })
    await pool.query(
      `INSERT INTO sales.customers (organization_id, customer_uid, company_name, default_payment_terms,
        source_system, source_table, source_id) VALUES ($1, $2, $2, $2, 'test', 'master-replacement', $2)`, [organizationId, name]
    )
    const deletion = { organizationId, kind: "commercial_commercial_term" as const, recordId: old.id, reason: "Replace term" }
    await expect(lifecycle.deleteMaster({ ...deletion, replacementRecordId: incompatible.id })).rejects.toThrow("field type")
    await lifecycle.deleteMaster({ ...deletion, replacementRecordId: next.id })
    expect((await pool.query(
      "SELECT default_payment_terms FROM sales.customers WHERE customer_uid = $1", [name]
    )).rows[0]?.default_payment_terms).toBe(`${name}-new`)
  })
})
