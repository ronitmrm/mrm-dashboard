import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"

import { createDashboardPlanningRepository } from "./dashboard-planning"
import { createMasterDataLifecycleRepository } from "./master-data-lifecycle"
import { createProductionShopFloorRepository } from "./production-shop-floor"
import { createQualityRepository } from "./quality"

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString, max: 2 })
const planning = createDashboardPlanningRepository({ pool })
const quality = createQualityRepository({ pool })
const lifecycle = createMasterDataLifecycleRepository({ pool })
const production = createProductionShopFloorRepository({ pool })
const suffix = randomUUID()
const machineNumber = `UNIT-ISOLATION-${suffix}`
let organizationId: string

beforeAll(async () => {
  const organization = await pool.query<{ id: string }>("INSERT INTO core.organizations (code, name) VALUES ($1, 'Production master isolation test') RETURNING id", [`MASTER-${suffix}`])
  organizationId = organization.rows[0]!.id
})

afterAll(async () => {
  await pool.query("DELETE FROM audit.events WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM manufacturing.production_break_schedules WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM catalog.machines WHERE organization_id = $1 AND machine_number = $2", [organizationId, machineNumber])
  await pool.query("DELETE FROM manufacturing.planning_calendar_exceptions WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM quality.parameter_definitions WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM quality.setup_checklist_templates WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM manufacturing.route_options WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM catalog.items WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM derived.outbox_events WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM derived.refresh_jobs WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM manufacturing.production_floors WHERE organization_id = $1", [organizationId])
  await pool.query("UPDATE store.accountable_stores SET default_location_id = NULL WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM store.locations WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM store.accountable_stores WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM derived.dashboard_source_revisions WHERE organization_id = $1", [organizationId])
  await pool.query("DELETE FROM core.organizations WHERE id = $1", [organizationId])
  await pool.end()
})

test("holidays are shared and a Friday can be changed to a working day", async () => {
  const input = { organizationId, exceptionDate: "2026-10-16", name: "Plant holiday", sourcePayload: { productionFloorCode: "cnc" } }
  const saved = await planning.upsertPlanningCalendarException(input)
  const row = (await pool.query<{ source_id: string }>("SELECT source_id FROM manufacturing.planning_calendar_exceptions WHERE id = $1", [saved.id])).rows[0]!
  expect(await planning.upsertPlanningCalendarException({ ...input, recordId: row.source_id, rejectDuplicates: true, dayType: "Working Friday", name: "Extra machining day" })).toEqual(saved)
  expect((await pool.query("SELECT source_payload FROM manufacturing.planning_calendar_exceptions WHERE id = $1", [saved.id])).rows[0].source_payload).toEqual({ date: "2026-10-16", dayType: "Working Friday", reason: "Extra machining day", remark: "" })
  await expect(planning.upsertPlanningCalendarException({ ...input, exceptionDate: "2026-10-17", dayType: "Working Friday" })).rejects.toThrow("Choose a Friday")
  await expect(planning.upsertPlanningCalendarException({ ...input, rejectDuplicates: true })).rejects.toThrow()
})

test("saving a machine from another unit is rejected instead of moving or overwriting it", async () => {
  const conventional = await planning.upsertMachine({ organizationId, machineNumber, productionFloorCode: "conventional", name: "Conventional machine" })
  await expect(planning.upsertMachine({ organizationId, machineNumber, productionFloorCode: "cnc", name: "CNC machine" })).rejects.toThrow("another Production Unit")
  expect(await planning.upsertMachine({ organizationId, machineNumber, productionFloorCode: "conventional", name: "Edited conventional machine" })).toEqual(conventional)
})

test("creates and updates the Conventional-02 break schedule", async () => {
  await pool.query("INSERT INTO manufacturing.production_floors (organization_id, code, name) VALUES ($1, 'conventional-02', 'Conventional-02')", [organizationId])
  const input = { organizationId, productionFloorCode: "conventional-02" }
  const breaks = [{ startTime: "10:30", endTime: "10:45" }]
  await production.saveProductionBreakSchedule({ ...input, breaks })
  expect((await production.readProductionBreakSchedule(input)).breaks).toEqual(breaks)
  const updated = [{ startTime: "11:00", endTime: "11:15" }]
  await production.saveProductionBreakSchedule({ ...input, breaks: updated })
  expect((await production.readProductionBreakSchedule(input)).breaks).toEqual(updated)
})

test("allocates setup checklist codes across units without concurrent duplicates", async () => {
  await pool.query(`INSERT INTO manufacturing.production_floors (organization_id, code, name)
    SELECT $1, code, code FROM unnest(ARRAY['cnc', 'conventional-02', 'forging']) code
    ON CONFLICT (organization_id, code) DO NOTHING`, [organizationId])
  const input = {
    organizationId, revision: 1, payload: {},
    items: [{ inputType: "checkbox", itemKey: "1", prompt: "Drawing checked", required: true, sequence: 1 }],
  }
  await quality.upsertSetupChecklistTemplate({ ...input, code: "SC001", productionFloorCode: "cnc", name: "CNC checklist" })
  const checklists = await Promise.all(["conventional-02", "forging"].map(productionFloorCode =>
    quality.upsertSetupChecklistTemplate({ ...input, code: "", productionFloorCode, name: "New setup checklist" })
  ))
  expect(checklists.map(row => row.code).sort()).toEqual(["SC002", "SC003"])
  await expect(quality.upsertSetupChecklistTemplate({ ...input, code: "SC001", productionFloorCode: "conventional-02", name: "Conflicting checklist" }))
    .rejects.toThrow("belongs to another production unit")
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
        expect(record.productionFloorCode).toBe(kind === "planning_holiday" ? null : "cnc")
        throw new Error("Fixture access denied")
      },
    })).rejects.toThrow("Fixture access denied")
  }
})
