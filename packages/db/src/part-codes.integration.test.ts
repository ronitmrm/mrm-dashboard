import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { afterAll, expect, test } from "vitest"
import { createPartCodeRepository } from "./part-codes"
import {
  readCanonicalDashboardSource,
  readCorrectionCandidateSource,
} from "./dashboard-read-model"
import { repositoryPool, withRepositoryTransaction } from "./postgres-runtime"

const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ??
    "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test",
  max: 2,
})
class RollbackFixture extends Error {}
afterAll(() => pool.end())

async function fixture(
  run: (context: {
    organizationId: string
    organizationCode: string
    itemId: string
    db: ReturnType<typeof repositoryPool>["pool"]
    repository: ReturnType<typeof createPartCodeRepository>
  }) => Promise<void>
) {
  try {
    await withRepositoryTransaction({ pool }, async () => {
      const db = repositoryPool({ pool }).pool
      const organizationId = randomUUID(),
        itemId = randomUUID()
      const organizationCode = `PART-RENAME-${randomUUID()}`
      const routeId = randomUUID(),
        setupId = randomUUID()
      await db.query(
        "INSERT INTO core.organizations (id, code, name) VALUES ($1, $2, 'Part rename rollback fixture')",
        [organizationId, organizationCode]
      )
      await db.query(
        "INSERT INTO manufacturing.production_floors (organization_id, code, name) VALUES ($1, 'cnc', 'CNC'), ($1, 'forging', 'Forging') ON CONFLICT (organization_id, code) DO NOTHING",
        [organizationId]
      )
      await db.query(
        `INSERT INTO catalog.items (id, organization_id, uid, description, production_type, source_system, source_table, source_id)
        VALUES ($1::uuid, $2, 'M103', 'Original part', 'Conventional', 'test', 'part-rename', $1::text),
               (gen_random_uuid(), $2, 'M1', 'Other part', 'CNC', 'test', 'part-rename', 'other')`,
        [itemId, organizationId]
      )
      for (const unit of ["cnc", "forging"]) {
        const unitRouteId = unit === "cnc" ? routeId : randomUUID()
        const unitSetupId = unit === "cnc" ? setupId : randomUUID()
        const payload = {
          partNo: "M103",
          optionNumber: "1",
          setupNo: "1",
          productionFloorCode: unit,
          machineType: unit === "cnc" ? "CNC" : "Forging Press",
        }
        await db.query(
          `INSERT INTO manufacturing.route_options (id, organization_id, item_id, route_code, production_floor_id, source_system, source_table, source_id)
        SELECT $1::uuid, $2, $3, '1', id, 'mrm-dashboard', 'dataEntries', $1::text FROM manufacturing.production_floors WHERE organization_id = $2 AND code = $4`,
          [unitRouteId, organizationId, itemId, unit]
        )
        await db.query(
          `INSERT INTO manufacturing.operation_setups (id, organization_id, route_option_id, setup_number, sequence, operation_code, source_system, source_table, source_id, source_payload)
        VALUES ($1::uuid, $2, $3, 1, 1, 'TURN', 'mrm-dashboard', 'dataEntries', $1::text, $4)`,
          [unitSetupId, organizationId, unitRouteId, payload]
        )
        await db.query(
          `INSERT INTO manufacturing.operation_cycle_standards (organization_id, operation_setup_id, cycle_time_seconds, pieces_per_cycle, source_system, source_table, source_id, source_payload)
        VALUES ($1, $2::uuid, $3, 2, 'mrm-dashboard', 'dataEntries', $2::text, $4)`,
          [
            organizationId,
            unitSetupId,
            unit === "cnc" ? 12 : 45,
            {
              entryType: "cycle",
              payload: { ...payload, cycleTime: unit === "cnc" ? 12 : 45 },
            },
          ]
        )
      }
      await db.query(
        `INSERT INTO manufacturing.work_orders (organization_id, work_order_number, job_card_number, item_id, ordered_quantity, source_system, source_table, source_id, source_payload)
        VALUES ($1, 'WO-RENAME', 'JC-RENAME', $2::uuid, 1000, 'mrm-dashboard', 'dataEntries', $2::text, '{"jcNo":"JC-RENAME","partCode":"M103","orderPcs":1000,"productionFloorCode":"cnc"}')`,
        [organizationId, itemId]
      )
      await db.query(
        `INSERT INTO manufacturing.raw_material_receipts (organization_id, receipt_number, job_card_number, received_on, quantity_kg, remaining_quantity_kg, source_system, source_table, source_id, source_payload)
        VALUES ($1, 'RM-RENAME', 'JC-RENAME', current_date, 50, 50, 'mrm-dashboard', 'rm_inward', $2, '{"jcNo":"JC-RENAME","partCode":"M103","rmInwardKg":50,"productionFloorCode":"cnc"}')`,
        [organizationId, randomUUID()]
      )
      await run({
        organizationId,
        organizationCode,
        itemId,
        db,
        repository: createPartCodeRepository({ pool }),
      })
      throw new RollbackFixture()
    })
  } catch (error) {
    if (!(error instanceof RollbackFixture)) throw error
  }
}

test("individual and bulk renames apply universally while each unit keeps its routes, cycles and original evidence", async () => {
  await fixture(
    async ({ organizationId, organizationCode, itemId, db, repository }) => {
      const snapshot = async () =>
        (
          await db.query(
            `SELECT
      (SELECT jsonb_agg(to_jsonb(item) - ARRAY['uid','updated_at','updated_by_user_id','row_version'] ORDER BY item.id) FROM catalog.items item WHERE organization_id = $1) AS items,
      (SELECT jsonb_agg(to_jsonb(route) ORDER BY route.id) FROM manufacturing.route_options route WHERE organization_id = $1) AS routes,
      (SELECT jsonb_agg(to_jsonb(setup) ORDER BY setup.id) FROM manufacturing.operation_setups setup WHERE organization_id = $1) AS setups,
      (SELECT jsonb_agg(to_jsonb(cycle) ORDER BY cycle.id) FROM manufacturing.operation_cycle_standards cycle WHERE organization_id = $1) AS cycles,
      (SELECT jsonb_agg(to_jsonb(work_order)) FROM manufacturing.work_orders work_order WHERE organization_id = $1) AS orders,
      (SELECT jsonb_agg(to_jsonb(receipt)) FROM manufacturing.raw_material_receipts receipt WHERE organization_id = $1) AS receipts`,
            [organizationId]
          )
        ).rows[0]
      const before = await snapshot()
      await expect(
        repository.rename({
          organizationCode,
          itemId,
          currentCode: "M103",
          newCode: " l1 ",
          actorUserId: null,
        })
      ).resolves.toEqual({ id: itemId, oldCode: "M103", newCode: "L1" })
      expect(await snapshot()).toEqual(before)
      const source = await readCanonicalDashboardSource(db, organizationId)
      const candidates = await readCorrectionCandidateSource(db, organizationId)
      for (const records of [
        source.allDataEntries,
        candidates.allDataEntries,
      ]) {
        expect(
          records
            .filter(
              (row) => row.entryType === "route" || row.entryType === "cycle"
            )
            .map((row) => row.payload)
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              partNo: "L1",
              machineType: "CNC",
              productionFloorCode: "cnc",
            }),
            expect.objectContaining({
              partNo: "L1",
              machineType: "Forging Press",
              productionFloorCode: "forging",
            }),
            expect.objectContaining({ partNo: "L1", cycleTime: 12 }),
            expect.objectContaining({ partNo: "L1", cycleTime: 45 }),
          ])
        )
      }
      expect(
        source.allDataEntries
          .filter((row) => ["work_order", "rm_inward"].includes(row.entryType))
          .map((row) => row.payload)
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            jcNo: "JC-RENAME",
            partCode: "L1",
            orderPcs: 1000,
          }),
          expect.objectContaining({
            jcNo: "JC-RENAME",
            partCode: "L1",
            rmInwardKg: 50,
          }),
        ])
      )
      const plan = await repository.renameMany({
        organizationCode,
        actorUserId: null,
        changes: [
          { currentCode: "L1", newCode: "L2" },
          { currentCode: "M1", newCode: "L3" },
        ],
        preview: true,
      })
      expect(
        (
          await db.query("SELECT uid FROM catalog.items WHERE id = $1", [
            itemId,
          ])
        ).rows[0].uid
      ).toBe("L1")
      await repository.renameMany({
        organizationCode,
        actorUserId: null,
        changes: plan,
      })
      expect(await snapshot()).toEqual(before)
      const renamedSource = await readCanonicalDashboardSource(
        db,
        organizationId
      )
      expect(
        renamedSource.allDataEntries
          .filter((row) => row.entryType === "route")
          .map((row) => row.payload)
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ partNo: "L2", productionFloorCode: "cnc" }),
          expect.objectContaining({
            partNo: "L2",
            productionFloorCode: "forging",
          }),
        ])
      )
      expect(
        (
          await db.query(
            "SELECT before_state->>'uid' AS old, after_state->>'uid' AS new FROM audit.events WHERE organization_id = $1 AND event_type = 'catalog.part_code.renamed'",
            [organizationId]
          )
        ).rows
      ).toEqual(
        expect.arrayContaining([
          { old: "M103", new: "L1" },
          { old: "L1", new: "L2" },
          { old: "M1", new: "L3" },
        ])
      )
    }
  )
})

test("rejects a duplicate in a bulk rename without changing any part or recording a rename", async () => {
  await fixture(
    async ({ organizationId, organizationCode, itemId, db, repository }) => {
      await expect(
        repository.renameMany({
          organizationCode,
          changes: [
            { itemId, currentCode: "M103", newCode: "L1" },
            { currentCode: "M1", newCode: " m103 " },
          ],
          actorUserId: null,
        })
      ).rejects.toThrow("already exists")
      expect(
        (
          await db.query(
            "SELECT uid FROM catalog.items WHERE organization_id = $1 ORDER BY uid",
            [organizationId]
          )
        ).rows
      ).toEqual([{ uid: "M1" }, { uid: "M103" }])
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM audit.events WHERE organization_id = $1 AND event_type = 'catalog.part_code.renamed'",
            [organizationId]
          )
        ).rows[0].count
      ).toBe(0)
    }
  )
})
