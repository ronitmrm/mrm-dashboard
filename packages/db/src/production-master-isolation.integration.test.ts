import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"

import { createDashboardPlanningRepository } from "./dashboard-planning"
import { createMasterDataLifecycleRepository } from "./master-data-lifecycle"

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString, max: 1 })
const planning = createDashboardPlanningRepository({ pool })
const lifecycle = createMasterDataLifecycleRepository({ pool })
const suffix = randomUUID()
const machineNumber = `UNIT-ISOLATION-${suffix}`
let organizationId: string

beforeAll(async () => {
  const organization = await pool.query<{ id: string }>("INSERT INTO core.organizations (code, name) VALUES ($1, 'Production master isolation test') RETURNING id", [`MASTER-${suffix}`])
  organizationId = organization.rows[0]!.id
})

afterAll(async () => {
  await pool.query("DELETE FROM catalog.machines WHERE organization_id = $1 AND machine_number = $2", [organizationId, machineNumber])
  await pool.query("DELETE FROM manufacturing.planning_calendar_exceptions WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM quality.parameter_definitions WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM manufacturing.route_options WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM catalog.items WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM derived.outbox_events WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM derived.refresh_jobs WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM manufacturing.production_floors WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM core.organizations WHERE id = $1", [organizationId])
  await pool.end()
})

test("a holiday cannot overwrite an existing holiday belonging to another unit", async () => {
  const input = { organizationId, exceptionDate: "2099-01-01", exceptionType: `holiday:${suffix}`, name: "Conventional holiday" }
  const conventional = await planning.upsertPlanningCalendarException(input)
  await expect(planning.upsertPlanningCalendarException({ ...input, name: "CNC holiday", sourcePayload: { productionFloorCode: "cnc" } })).rejects.toThrow("another Production Unit")
  expect(await planning.upsertPlanningCalendarException({ ...input, name: "Edited conventional holiday", sourcePayload: { productionFloorCode: "conventional" } })).toEqual(conventional)
})

test("saving a machine from another unit is rejected instead of moving or overwriting it", async () => {
  const conventional = await planning.upsertMachine({ organizationId, machineNumber, productionFloorCode: "conventional", name: "Conventional machine" })
  await expect(planning.upsertMachine({ organizationId, machineNumber, productionFloorCode: "cnc", name: "CNC machine" })).rejects.toThrow("another Production Unit")
  expect(await planning.upsertMachine({ organizationId, machineNumber, productionFloorCode: "conventional", name: "Edited conventional machine" })).toEqual(conventional)
})

test("delete authorization resolves the stored route unit rather than trusting its source payload", async () => {
  const route = await planning.upsertRouteOption({
    organizationId,
    itemUid: `MASTER-${suffix}`,
    productionFloorCode: "cnc",
    routeCode: "1",
    setups: [{ operationCode: "TEST", setupNumber: 1, sequence: 1 }],
    sourcePayload: { productionFloorCode: "forging" },
  })
  const setup = await pool.query<{ id: string }>("UPDATE manufacturing.operation_setups SET source_id = $2 WHERE route_option_id = $1 RETURNING id", [route.id, suffix])
  const setupId = setup.rows[0]!.id
  await pool.query("INSERT INTO manufacturing.operation_cycle_standards (organization_id, operation_setup_id, cycle_time_seconds, source_system, source_table, source_id, source_payload) VALUES ($1, $2, 12, 'test', 'unit-isolation', $3, '{\"productionFloorCode\":\"forging\"}')", [organizationId, setupId, suffix])
  await pool.query("INSERT INTO manufacturing.operation_tooling (organization_id, operation_setup_id, tool_code, source_system, source_table, source_id, source_payload) VALUES ($1, $2, $3, 'test', 'unit-isolation', $3, '{\"productionFloorCode\":\"forging\"}')", [organizationId, setupId, suffix])
  await pool.query("INSERT INTO quality.parameter_definitions (organization_id, item_id, route_option_id, operation_setup_id, parameter_code, name, data_type, source_system, source_table, source_id, source_payload) SELECT organization_id, item_id, id, $2, $3, 'Permission fixture', 'text', 'test', 'unit-isolation', $3, '{\"productionFloorCode\":\"forging\"}' FROM manufacturing.route_options WHERE id = $1", [route.id, setupId, suffix])
  await pool.query("INSERT INTO manufacturing.planning_calendar_exceptions (organization_id, exception_date, exception_type, name, source_system, source_table, source_id, source_payload) VALUES ($1, '2099-01-02', $2, 'CNC holiday', 'test', 'unit-isolation', $2, '{\"productionFloorCode\":\"cnc\"}')", [organizationId, suffix])

  for (const kind of ["route", "cycle", "tooling", "quality_parameter_master", "planning_holiday"] as const) {
    await expect(lifecycle.deleteMaster({
      organizationId,
      kind,
      recordId: suffix,
      reason: "Check stored unit authorization",
      authorize: async (record) => {
        expect(record.productionFloorCode).toBe("cnc")
        throw new Error("Fixture access denied")
      },
    })).rejects.toThrow("Fixture access denied")
  }
})
