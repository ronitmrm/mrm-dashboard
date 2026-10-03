import type { Pool } from "pg"
import { expect, it } from "vitest"

import { createDashboardReadModelRepository } from "./dashboard-read-model-repository"

it("delivers a saved RM stage to the machinist queue before planning refresh", async () => {
  const createdAt = new Date("2026-10-03T12:00:00.000Z")
  const liveVersion = "2026-10-03 12:01:00+00"
  const query = async (_sql: unknown, parameters?: unknown[]) => ({
    rows: [{
      attempts: 0,
      completed_at: null,
      job_status: "pending",
      last_error: null,
      live_version: liveVersion,
      live_setup_stages: [{
        active: true,
        completedAt: null,
        machine: "CNC-9",
        stage: "raw_material_at_machine",
        payload: {
          jcNo: "P2238", partCode: "M421B", optionNumber: "1",
          setupNo: "1", completedAt: "2026-10-03T12:01:00.000Z",
        },
      }],
      model_created_at: createdAt,
      model_payload: parameters?.[3] === liveVersion ? null : { productionControl: { machinePlanDetailRows: [{
        jcNo: "P2238", partCode: "M421B", optionNumber: "1",
        setupNo: "1", machine: "CNC-9", shopFloorStage: "planned",
        shopFloorTaskReady: false, shopFloorTaskBlocker: "Planned date not due",
      }] } },
      model_source_watermark: {},
      model_version: "7",
      requested_at: createdAt,
      started_at: null,
    }],
  })
  const repository = createDashboardReadModelRepository({
    pool: { query } as unknown as Pool,
  })

  const state = await repository.state(
    "11111111-1111-4111-8111-111111111111", {}, "cnc", 7
  )

  expect(state.notModified).toBe(false)
  expect(state.version).toBe(7)
  expect(state.liveVersion).toBe(liveVersion)
  expect(state.dashboard).toMatchObject({
    productionControl: { machinePlanDetailRows: [{
      shopFloorStage: "raw_material_at_machine",
      shopFloorTaskReady: true,
      shopFloorTaskBlocker: "",
      shopFloorUpdatedAt: "2026-10-03T12:01:00.000Z",
    }] },
  })
  const unchanged = await repository.state(
    "11111111-1111-4111-8111-111111111111", {}, "cnc", 7, liveVersion
  )
  expect(unchanged.notModified).toBe(true)
  expect(unchanged.dashboard).toBeNull()
})
