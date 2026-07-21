import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDashboardReadModelRepository } from "./dashboard-read-model-repository"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test"
const pool = new Pool({ connectionString })
const repository = createDashboardReadModelRepository({ connectionString })
const suffix = randomUUID().slice(0, 8)
const sourceId = `machine-correction-${suffix}`
let organizationId: string

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const organization = await pool.query<{ id: string }>(
    `INSERT INTO core.organizations (code, name) VALUES ($1, $2) RETURNING id`,
    [`CORRECTION-${suffix}`, `Correction ${suffix}`]
  )
  organizationId = organization.rows[0]!.id
  const machineType = await pool.query<{ id: string }>(
    `
      INSERT INTO catalog.machine_types (
        organization_id, name, source_system, source_table, source_id
      ) VALUES ($1, 'CNC', 'test', 'machine_type', $2)
      RETURNING id
    `,
    [organizationId, randomUUID()]
  )
  await pool.query(
    `
      INSERT INTO catalog.machines (
        organization_id, machine_number, machine_type_id,
        source_system, source_table, source_id, source_payload
      ) VALUES ($1, 'CORRECTION-01', $2, 'mrm-dashboard', 'dataEntries', $3, $4)
    `,
    [
      organizationId,
      machineType.rows[0]!.id,
      sourceId,
      {
        _id: sourceId,
        createdAt: "2026-07-21T12:00:00.000Z",
        entryType: "machine_master",
        key: "CORRECTION-01",
        payload: { machineNo: "CORRECTION-01", machineType: "CNC" },
      },
    ]
  )
})

afterAll(async () => {
  await repository.close()
  await pool.end()
})

describe("PostgreSQL dashboard corrections", () => {
  it("records a reversal and removes the source row from later candidates", async () => {
    const before = await repository.correctionCandidates(organizationId)
    expect(before).toContainEqual(
      expect.objectContaining({ targetId: sourceId, targetTable: "dataEntries" })
    )

    const result = await repository.reverseEntry({
      correctedBy: "Correction Tester",
      organizationId,
      reason: "Incorrect machine row",
      targetId: sourceId,
      targetKey: "CORRECTION-01",
      targetLabel: "Machine CORRECTION-01",
      targetTable: "dataEntries",
    })

    expect(result).toEqual({ reversed: true })
    const after = await repository.correctionCandidates(organizationId)
    expect(after).not.toContainEqual(
      expect.objectContaining({ targetId: sourceId, targetTable: "dataEntries" })
    )
    const stored = await pool.query<{ source_payload: Record<string, unknown> }>(
      `
        SELECT source_payload
        FROM audit.legacy_convex_corrections
        WHERE organization_id = $1 AND target_source_id = $2
      `,
      [organizationId, sourceId]
    )
    expect(stored.rows[0]?.source_payload).toMatchObject({
      action: "reverse",
      correctedBy: "Correction Tester",
      reason: "Incorrect machine row",
      targetId: sourceId,
      targetTable: "dataEntries",
    })
  })
})
