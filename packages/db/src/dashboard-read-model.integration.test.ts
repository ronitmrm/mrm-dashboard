import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

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
let coverageOrganizationId: string

const coverageCases = [
  ["data_entry", "cycle", 2500],
  ["data_entry", "employee", 1000],
  ["data_entry", "first_piece_inspection_report", 2500],
  ["data_entry", "hourly_quality_check", 5000],
  ["data_entry", "machine_master", 1000],
  ["data_entry", "maintenance_checklist_master", 2000],
  ["data_entry", "maintenance_master", 1000],
  ["data_entry", "maintenance_schedule", 2500],
  ["data_entry", "maintenance_task", 5000],
  ["data_entry", "planning_holiday", 1000],
  ["data_entry", "production_card", 5000],
  ["data_entry", "quality_parameter_master", 2000],
  ["data_entry", "rejection_reason_master", 500],
  ["data_entry", "rejection_remark_master", 500],
  ["data_entry", "rejection_type_master", 500],
  ["data_entry", "rm_inward", 2000],
  ["data_entry", "route", 2500],
  ["data_entry", "setup_checklist_master", 2000],
  ["data_entry", "setup_checklist_session", 5000],
  ["data_entry", "shop_floor_status", 5000],
  ["data_entry", "tooling", 2500],
  ["data_entry", "work_order", 5000],
  ["physical", "attendanceRecords", 5000],
  ["physical", "dispatchApprovals", 2000],
  ["physical", "machineConstraints", 2000],
  ["physical", "planOverrides", 2000],
  ["physical", "plannerPriorities", 2000],
  ["physical", "productionEntries", 10000],
  ["physical", "routeChanges", 2000],
  ["physical", "routeSelections", 2500],
  ["physical", "setupCompletions", 5000],
  ["physical", "trainingRecords", 2500],
  ["correction", "corrections", 5000],
] as const

type CoverageFacts = {
  available: number
  limit: number
  returned: number
  truncated: boolean
}

type FloorSourceCoverage = {
  corrections: CoverageFacts
  dataEntries: { groups: Record<string, CoverageFacts> }
  physicalRows: { groups: Record<string, CoverageFacts> }
}

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
  const coverageOrganization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ($1, $2)
      RETURNING id
    `,
    [`COVERAGE-${suffix}`, `Coverage ${suffix}`]
  )
  coverageOrganizationId = coverageOrganization.rows[0]!.id
})

afterEach(async () => {
  await pool.query(
    `
      DELETE FROM derived.dashboard_source_records
      WHERE organization_id = $1 AND source_schema = 'coverage_test'
    `,
    [coverageOrganizationId]
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
          cnc: {
            sourceCoverage: {
              dataEntries: {
                available: 1,
                groups: {
                  machine_master: {
                    available: 1,
                    limit: 1000,
                    returned: 1,
                    truncated: false,
                  },
                },
                returned: 1,
              },
            },
          },
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
        sourceCoverageByFloor: {
          cnc: {
            dataEntries: {
              groups: {
                machine_master: {
                  available: 1,
                  limit: 1000,
                  returned: 1,
                  truncated: false,
                },
              },
            },
          },
        },
      })
    } finally {
      client.release()
    }
  })

  it("loads bounded floor-aware sources in one database statement", async () => {
    const client = await pool.connect()
    const statements: Array<{ parameters?: unknown[]; sql: string }> = []
    const countedClient = {
      query: async (sql: string, parameters?: unknown[]) => {
        statements.push({ parameters, sql })
        return client.query(sql, parameters)
      },
    }

    try {
      const source = await readCanonicalDashboardSource(
        countedClient as never,
        organizationId
      )

      expect(statements).toHaveLength(1)
      expect(statements[0]!.sql).toContain(
        "AND production_floor_code = budget.floor_code"
      )
      expect(statements[0]!.sql).not.toContain("source_payload ->>")
      expect(source.allDataEntries).toContainEqual(
        expect.objectContaining({
          _id: machineSourceId,
          productionFloorCode: "cnc",
        })
      )
      expect(source.sourceCoverage).toMatchObject({
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
      expect(source.sourceCoverageByFloor.cnc.dataEntries.groups).toMatchObject(
        {
          machine_master: {
            available: 1,
            limit: 1000,
            returned: 1,
            truncated: false,
          },
        }
      )

      await client.query("BEGIN")
      try {
        await client.query("SET LOCAL enable_seqscan = off")
        await client.query("SET LOCAL enable_sort = off")
        const plan = await client.query<{ "QUERY PLAN": string }>(
          `EXPLAIN ${statements[0]!.sql}`,
          statements[0]!.parameters
        )
        const planText = plan.rows.map((row) => row["QUERY PLAN"]).join("\n")
        expect(planText).toContain(
          "dashboard_source_records_entry_floor_read_idx"
        )
        expect(planText).toContain(
          "dashboard_source_records_group_floor_read_idx"
        )
        expect(planText).toContain(
          "dashboard_source_records_correction_floor_read_idx"
        )
      } finally {
        await client.query("ROLLBACK")
      }
    } finally {
      client.release()
    }
  })

  it("transfers only six machine-plan continuity fields from prior models", async () => {
    const continuityFields = [
      "jcNo",
      "machine",
      "optionNumber",
      "partCode",
      "routeMachine",
      "setupNo",
    ]
    const continuityRow = (floorCode: string) => ({
      forbidden: `not-transferred-${floorCode}`,
      jcNo: `JC-${floorCode}`,
      machine: `M-${floorCode}`,
      optionNumber: 2,
      partCode: `P-${floorCode}`,
      routeMachine: `R-${floorCode}`,
      setupNo: 3,
    })
    const priorPayload = {
      forbiddenLargeField: "x".repeat(1_000_000),
      productionControl: {
        machinePlanDetailRows: [continuityRow("conventional")],
      },
      productionFloorSnapshots: {
        cnc: {
          productionControl: {
            machinePlanDetailRows: [continuityRow("cnc")],
          },
        },
        forging: {
          productionControl: {
            machinePlanDetailRows: [continuityRow("forging")],
          },
        },
      },
    }
    await pool.query(
      `
        INSERT INTO derived.dashboard_read_models (
          organization_id, version, payload, source_watermark
        ) VALUES ($1, 1, $2, '{}'::jsonb)
      `,
      [organizationId, priorPayload]
    )

    const client = await pool.connect()
    const priorReads: Array<{
      parameters?: unknown[]
      responseBytes: number
      rows: unknown[]
      sql: string
    }> = []
    const measuredClient = {
      query: async (sql: string, parameters?: unknown[]) => {
        const result = await client.query(sql, parameters)
        if (sql.includes("derived.dashboard_read_models")) {
          priorReads.push({
            parameters,
            responseBytes: Buffer.byteLength(JSON.stringify(result.rows)),
            rows: result.rows,
            sql,
          })
        }
        return result
      },
    }

    try {
      await buildCanonicalDashboardReadModel(measuredClient as never, {
        organizationId,
      })
      expect(priorReads).toHaveLength(1)
      const priorRead = priorReads[0]!
      expect(priorRead.sql.trimStart()).not.toMatch(/^SELECT\s+payload/i)
      expect(priorRead.parameters).toContainEqual(continuityFields)
      expect(priorRead.responseBytes).toBeLessThan(2048)
      expect(priorRead.rows).toEqual(
        ["conventional", "cnc", "forging"].map((floorCode) => ({
          machine_plan_row: {
            jcNo: `JC-${floorCode}`,
            machine: `M-${floorCode}`,
            optionNumber: 2,
            partCode: `P-${floorCode}`,
            routeMachine: `R-${floorCode}`,
            setupNo: 3,
          },
          production_floor_code: floorCode,
        }))
      )
    } finally {
      client.release()
    }
  })

  it.each(coverageCases)(
    "reports per-floor cap transitions for %s/%s",
    async (sourceKind, category, limit) => {
      const sourceGroup = sourceKind === "data_entry" ? "dataEntries" : category
      const entryType = sourceKind === "data_entry" ? category : null
      await pool.query(
        `
          INSERT INTO derived.dashboard_source_records (
            organization_id, source_schema, source_table, source_id,
            source_kind, source_group, entry_type, changed_at, source_payload
          )
          SELECT $1, 'coverage_test', $2,
            floor.code || ':' || ordinal::text,
            $3::text, $4::text, $5::text,
            timestamptz '2026-08-08 00:00:00+00'
              + ordinal * interval '1 microsecond',
            jsonb_strip_nulls(jsonb_build_object(
              '_id', floor.code || ':' || ordinal::text,
              'entryType', $5::text,
              'productionFloorCode', floor.code,
              'payload', jsonb_build_object(
                'productionFloorCode', floor.code
              )
            ))
          FROM (VALUES ('conventional', 0), ('cnc', 1)) floor(code, extra)
          CROSS JOIN LATERAL generate_series(1, $6 + floor.extra) ordinal
        `,
        [
          coverageOrganizationId,
          `coverage_${sourceKind}_${category}`,
          sourceKind,
          sourceGroup,
          entryType,
          limit,
        ]
      )

      const client = await pool.connect()
      try {
        const source = await readCanonicalDashboardSource(
          client,
          coverageOrganizationId
        )
        const coverageByFloor = (
          source as unknown as {
            sourceCoverageByFloor?: Record<string, FloorSourceCoverage>
          }
        ).sourceCoverageByFloor
        expect(coverageByFloor).toBeDefined()

        const factsFor = (floorCode: string) => {
          const floorCoverage = coverageByFloor![floorCode]!
          const facts =
            sourceKind === "correction"
              ? floorCoverage.corrections
              : sourceKind === "data_entry"
                ? floorCoverage.dataEntries.groups[category]!
                : floorCoverage.physicalRows.groups[category]!
          return {
            available: facts.available,
            limit: facts.limit,
            returned: facts.returned,
            truncated: facts.truncated,
          }
        }
        expect(factsFor("conventional")).toEqual({
          available: limit,
          limit,
          returned: limit,
          truncated: false,
        })
        expect(factsFor("cnc")).toEqual({
          available: limit + 1,
          limit,
          returned: limit,
          truncated: true,
        })
        expect(factsFor("forging")).toEqual({
          available: 0,
          limit,
          returned: 0,
          truncated: false,
        })

        const returnedRows =
          sourceKind === "correction"
            ? source.corrections
            : sourceKind === "data_entry"
              ? source.allDataEntries.filter(
                  (row) => row.entryType === category
                )
              : (source[category as keyof typeof source] as Array<
                  Record<string, unknown>
                >)
        const returnedByFloor = returnedRows.reduce<Record<string, number>>(
          (counts, row) => {
            const floorCode = String(row.productionFloorCode)
            counts[floorCode] = (counts[floorCode] ?? 0) + 1
            return counts
          },
          {}
        )
        expect(returnedByFloor).toEqual({
          cnc: limit,
          conventional: limit,
        })
      } finally {
        client.release()
      }
    }
  )
})
