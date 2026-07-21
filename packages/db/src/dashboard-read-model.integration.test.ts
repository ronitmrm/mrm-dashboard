import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildCanonicalDashboardReadModel } from "./dashboard-read-model"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test"
const pool = new Pool({ connectionString })
const suffix = randomUUID().slice(0, 8)
let organizationId: string

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, $2)
      RETURNING id
    `,
    [`READ-${suffix}`, `Read model ${suffix}`]
  )
  organizationId = organization.rows[0]!.id
})

afterAll(async () => {
  await pool.end()
})

describe("canonical PostgreSQL dashboard read model", () => {
  it("feeds the unchanged planning analysis from normalized canonical rows", async () => {
    const machineType = await pool.query<{ id: string }>(
      `
        INSERT INTO catalog.machine_types (
          organization_id, name, source_system, source_table, source_id
        )
        VALUES ($1, 'CNC', 'test', 'machine_type', $2)
        RETURNING id
      `,
      [organizationId, randomUUID()]
    )
    await pool.query(
      `
        INSERT INTO catalog.machines (
          organization_id, machine_number, name, machine_type_id,
          source_system, source_table, source_id, source_payload
        )
        VALUES ($1, 'CNC-READ-01', 'Read model machine', $2,
          'convex', 'dataEntries', $3, $4)
      `,
      [
        organizationId,
        machineType.rows[0]!.id,
        `machine-${suffix}`,
        {
          _id: `machine-${suffix}`,
          createdAt: "2026-07-21T12:00:00.000Z",
          entryType: "machine_master",
          key: "CNC-READ-01",
          payload: { machineType: "CNC", unitNo: "CNC-READ-01" },
        },
      ]
    )

    const client = await pool.connect()
    try {
      const built = await buildCanonicalDashboardReadModel(client, {
        organizationId,
      })
      const payload = built.payload as {
        cacheStatus: string
        dataEntry: {
          keySummary: Array<{ entryType: string; rows: number }>
        }
      }
      expect(payload.cacheStatus).toBe("ready")
      expect(
        payload.dataEntry.keySummary.find(
          (row) => row.entryType === "machine_master"
        )
      ).toEqual({ entryType: "machine_master", rows: 1 })
      expect(built.sourceWatermark).toMatchObject({
        changedAt: expect.any(String),
      })
    } finally {
      client.release()
    }
  })
})
