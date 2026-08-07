import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  buildCanonicalDashboardReadModel,
  readCanonicalDashboardSource,
} from "./dashboard-read-model"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test"
const pool = new Pool({ connectionString })
const suffix = randomUUID().slice(0, 8)
let organizationId: string
let machineSourceId: string

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
  const floor = await pool.query<{ id: string }>(
    `
      INSERT INTO manufacturing.production_floors (
        organization_id, code, name
      ) VALUES ($1, 'cnc', 'CNC Production Floor')
      RETURNING id
    `,
    [organizationId]
  )
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
  machineSourceId = `machine-${suffix}`
  await pool.query(
    `
      INSERT INTO catalog.machines (
        organization_id, machine_number, name, machine_type_id,
        production_floor_id, source_system, source_table, source_id,
        source_payload
      )
      VALUES ($1, 'CNC-READ-01', 'Read model machine', $2, $3,
        'convex', 'dataEntries', $4, $5)
    `,
    [
      organizationId,
      machineType.rows[0]!.id,
      floor.rows[0]!.id,
      machineSourceId,
      {
        _id: machineSourceId,
        createdAt: "2026-07-21T12:00:00.000Z",
        entryType: "machine_master",
        key: "CNC-READ-01",
        payload: {
          machineType: "CNC",
          productionFloorCode: "cnc",
          unitNo: "CNC-READ-01",
        },
        productionFloorCode: "cnc",
      },
    ]
  )
})

afterAll(async () => {
  await pool.end()
})

describe("canonical PostgreSQL dashboard read model", () => {
  it("feeds the unchanged planning analysis from normalized canonical rows", async () => {
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
        productionFloorSnapshots: Record<
          string,
          {
            dataEntry: {
              keySummary: Array<{ entryType: string; rows: number }>
            }
          }
        >
      }
      const sourceCoverage = {
        corrections: {
          limit: 5000,
          truncated: false,
          truncatedGroups: [],
        },
        dataEntries: {
          limit: expect.any(Number),
          truncated: false,
          truncatedGroups: [],
        },
        physicalRows: {
          limit: expect.any(Number),
          truncated: false,
          truncatedGroups: [],
        },
      }
      expect(payload.cacheStatus).toBe("ready")
      expect(payload).toMatchObject({
        productionFloorSnapshots: {
          cnc: { sourceCoverage },
        },
        sourceCoverage,
      })
      expect(
        payload.productionFloorSnapshots.cnc?.dataEntry.keySummary.find(
          (row) => row.entryType === "machine_master"
        )
      ).toEqual({ entryType: "machine_master", rows: 1 })
      expect(built.sourceWatermark).toMatchObject({
        changedAt: expect.any(String),
        sourceCoverage,
      })
    } finally {
      client.release()
    }
  })

  it("loads bounded floor-aware sources in one database statement", async () => {
    const client = await pool.connect()
    const statements: string[] = []
    const countedClient = {
      query: async (sql: string, parameters?: unknown[]) => {
        statements.push(sql)
        return client.query(sql, parameters)
      },
    }

    try {
      const source = await readCanonicalDashboardSource(
        countedClient as never,
        organizationId
      )

      expect(statements).toHaveLength(1)
      expect(source.allDataEntries).toContainEqual(
        expect.objectContaining({
          _id: machineSourceId,
          productionFloorCode: "cnc",
        })
      )
      expect(source.sourceCoverage).toEqual({
        corrections: {
          limit: 5000,
          truncated: false,
          truncatedGroups: [],
        },
        dataEntries: {
          limit: expect.any(Number),
          truncated: false,
          truncatedGroups: [],
        },
        physicalRows: {
          limit: expect.any(Number),
          truncated: false,
          truncatedGroups: [],
        },
      })
    } finally {
      client.release()
    }
  })
})
