import { randomUUID } from "node:crypto"

import {
  createArtifactService,
  createDashboardPlanningRepository,
  migrateDatabase,
} from "@workspace/db"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { parseTemplateUpload } from "./template-upload"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString })
const artifacts = createArtifactService({ connectionString })
const planning = createDashboardPlanningRepository({ connectionString })
const organizationId = randomUUID()

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  await pool.query(
    `INSERT INTO core.organizations (id, code, name)
     VALUES ($1, $2, 'Operational import retention test')`,
    [organizationId, `OP-IMPORT-${organizationId.slice(0, 8)}`]
  )
})

afterAll(async () => {
  await artifacts.close()
  await planning.close()
  await pool.end()
})

describe("operational-master template uploads", () => {
  test("parse and persist without creating an Artifact", async () => {
    const artifactCountBefore = (
      await artifacts.listByOrganization({ organizationId })
    ).length
    const setupName = `Imported setup ${organizationId.slice(0, 8)}`
    const csv = `setupName,productionFloorCode\n${setupName},conventional\n`
    const importBatch = parseTemplateUpload(
      "setup_name_master",
      "setup_name_master.csv",
      Buffer.from(csv).toString("base64"),
      new Set(["setup_name_master"])
    )

    expect(importBatch).toMatchObject({ duplicateCount: 0 })
    expect(importBatch.rows).toHaveLength(1)
    for (const row of importBatch.rows) {
      await planning.upsertSetupName({
        name: String(row.setupName),
        organizationId,
        productionFloorCode: String(row.productionFloorCode),
        sourcePayload: row,
      })
    }

    const artifactCountAfter = (
      await artifacts.listByOrganization({ organizationId })
    ).length
    expect(artifactCountAfter).toBe(artifactCountBefore)
  })
})
