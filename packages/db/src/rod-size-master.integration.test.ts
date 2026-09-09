import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"
import { createCommercialMasterRepository } from "./commercial-masters"
import { createCommercialWorkflowRepository } from "./commercial-workflow"
import { createMasterDataLifecycleRepository } from "./master-data-lifecycle"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString, max: 1 })
const repository = createCommercialMasterRepository({ pool })
const workflow = createCommercialWorkflowRepository({ pool })
const lifecycle = createMasterDataLifecycleRepository({ pool })
let organizationId: string
const organizationCode = `ROD-${randomUUID()}`

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const result = await pool.query<{ id: string }>(
    "INSERT INTO core.organizations (code, name) VALUES ($1, 'Rod Size Master Test') RETURNING id",
    [organizationCode]
  )
  organizationId = result.rows[0]!.id
})

afterAll(async () => {
  await repository.close()
  await pool.end()
})

test("saves unique organization-scoped Rod Sizes and lists them in the editable master", async () => {
  await repository.upsertNamed({
    organizationId,
    kind: "rodSize",
    name: " 12 mm ",
  })
  await repository.upsertNamed({
    organizationId,
    kind: "rodSize",
    name: "12 MM",
  })
  const rows = await repository.listEditableRows({
    organizationId,
    kind: "commercial_rod_size",
  })
  expect(rows.map(({ label }) => label)).toEqual(["12 mm"])
  expect((await repository.snapshot(organizationId)).rodSizes).toEqual([
    { name: "12 mm" },
  ])
  expect(
    (await workflow.getDesignWorkspaceOptions(organizationCode)).rodSizes
  ).toEqual(["12 mm"])
  await lifecycle.renameMaster({
    organizationId,
    kind: "commercial_rod_size",
    recordId: rows[0]!.id,
    name: "13 mm",
  })
  expect(
    (await workflow.getDesignWorkspaceOptions(organizationCode)).rodSizes
  ).toEqual(["13 mm"])
  await lifecycle.deleteMaster({
    organizationId,
    kind: "commercial_rod_size",
    recordId: rows[0]!.id,
    reason: "Remove test choice",
  })
  expect((await repository.snapshot(organizationId)).rodSizes).toEqual([])
})

test("seeds all permanent portfolio sizes without customer codes, excludes blanks, and is repeatable", async () => {
  const seededOrg = await pool.query<{ id: string }>(
    "INSERT INTO core.organizations (code, name) VALUES ($1, 'Uncoded Portfolio Test') RETURNING id",
    [`ROD-SEED-${randomUUID()}`]
  )
  const org = seededOrg.rows[0]!.id
  // These products deliberately have no customer, alias, quote, or price records.
  for (const [size, status] of [
    [" 14 Hex ", "P"],
    ["14 hex", "P"],
    ["16 Round", "P"],
    [" ", "P"],
    ["99 Draft", "Q"],
  ]) {
    const uid = randomUUID()
    await pool.query(
      `INSERT INTO catalog.items (organization_id, uid, description, rod_size, lifecycle_status, source_system, source_table, source_id)
       VALUES ($1, $2, 'Uncoded product', $3, $4, 'test', 'rod_seed', $2)`,
      [org, uid, size, status]
    )
  }
  const sql = await readFile(
    new URL("../migrations/0120_portfolio_rod_sizes.sql", import.meta.url),
    "utf8"
  )
  await pool.query(sql)
  await pool.query(sql)
  expect((await repository.snapshot(org)).rodSizes).toEqual([
    { name: "14 Hex" },
    { name: "16 Round" },
  ])
})
