import { randomUUID } from "node:crypto"
import { setTimeout } from "node:timers/promises"

import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"

import { createDashboardPlanningRepository } from "./dashboard-planning"
import { createQualityRepository } from "./quality"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString, max: 3 })
const planning = createDashboardPlanningRepository({ pool })
const quality = createQualityRepository({ pool })
const suffix = randomUUID().slice(0, 8)
const itemUid = `QUALITY-SET-${suffix}`
let organizationId: string

beforeAll(async () => {
  const organization = await pool.query<{ id: string }>(
    "INSERT INTO core.organizations (code, name) VALUES ($1, 'Quality set save test') RETURNING id",
    [`QUALITY-SET-${suffix}`]
  )
  organizationId = organization.rows[0]!.id
  await planning.upsertRouteOption({
    itemUid,
    organizationId,
    productionFloorCode: "cnc",
    routeCode: "1",
    setups: [{ operationCode: "QUALITY", sequence: 1, setupNumber: 1 }],
  })
  for (const name of [`Base ${suffix}`, `Added ${suffix}`]) {
    await quality.upsertQualityReference({
      active: true,
      kind: "parameter_master",
      name,
      organizationId,
      payload: {},
    })
  }
  await quality.upsertParameterDefinition({
    dataType: "numeric",
    itemUid,
    name: `Base ${suffix}`,
    operationSetupCode: "1",
    organizationId,
    parameterCode: "P1",
    payload: { specification: "10" },
    productionFloorCode: "cnc",
    routeCode: "1",
    sequence: 1,
  })
})

afterAll(async () => {
  if (organizationId) {
    await pool.query(
      "DELETE FROM derived.outbox_events WHERE organization_id = $1",
      [organizationId]
    )
    await pool.query(
      "DELETE FROM derived.refresh_jobs WHERE organization_id = $1",
      [organizationId]
    )
    await pool.query(
      "DELETE FROM quality.parameter_definitions WHERE organization_id = $1",
      [organizationId]
    )
    await pool.query(
      "DELETE FROM quality.parameter_names WHERE organization_id = $1",
      [organizationId]
    )
    await pool.query(
      "DELETE FROM manufacturing.route_options WHERE organization_id = $1",
      [organizationId]
    )
    await pool.query("DELETE FROM catalog.items WHERE organization_id = $1", [
      organizationId,
    ])
    await pool.query(
      "DELETE FROM manufacturing.production_floors WHERE organization_id = $1",
      [organizationId]
    )
    await pool.query("DELETE FROM core.organizations WHERE id = $1", [
      organizationId,
    ])
  }
  await pool.end()
})

test("one changed parameter commits with one successor refresh while a rebuild holds its job", async () => {
  const oldJob = await pool.query<{ id: string }>(
    `SELECT id FROM derived.refresh_jobs
     WHERE organization_id = $1 AND queue_key = 'dashboard' AND status = 'pending'`,
    [organizationId]
  )
  const blocker = await pool.connect()
  try {
    await blocker.query("BEGIN")
    await blocker.query(
      "SELECT id FROM derived.refresh_jobs WHERE id = $1 FOR UPDATE",
      [oldJob.rows[0]!.id]
    )
    const save = quality.saveParameterSet([
      {
        dataType: "numeric",
        itemUid,
        name: `Added ${suffix}`,
        operationSetupCode: "1",
        organizationId,
        parameterCode: "P2",
        payload: { specification: "20" },
        productionFloorCode: "cnc",
        routeCode: "1",
        sequence: 2,
      },
    ])
    const settled = await Promise.race([
      save.then(() => true),
      setTimeout(1_000).then(() => false),
    ])
    await blocker.query("COMMIT")
    expect(settled).toBe(true)
    expect(await save).toMatchObject({ rowsUpdated: 1, queued: true })
    const rows = await pool.query<{
      parameter_code: string
      row_version: string
    }>(
      "SELECT parameter_code, row_version FROM quality.parameter_definitions WHERE organization_id = $1 ORDER BY parameter_code",
      [organizationId]
    )
    expect(rows.rows).toEqual([
      { parameter_code: "P1", row_version: "1" },
      { parameter_code: "P2", row_version: "1" },
    ])
    const jobs = await pool.query<{ count: string }>(
      "SELECT count(*) FROM derived.refresh_jobs WHERE organization_id = $1 AND queue_key LIKE 'dashboard:quality-parameter-set:%' AND status = 'pending'",
      [organizationId]
    )
    expect(jobs.rows[0]?.count).toBe("1")
  } finally {
    await blocker.query("ROLLBACK")
    blocker.release()
  }
})
