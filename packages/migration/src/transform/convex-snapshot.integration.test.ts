import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { migrateDatabase } from "@workspace/db"
import { strToU8, zipSync } from "fflate"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { createMigrationRun, stageConvexExport } from "../load/convex-staging"
import { transformConvexSnapshot } from "./convex-snapshot"

const connectionString = process.env.TEST_DATABASE_URL
const temporaryDirectories: string[] = []
const pool = connectionString ? new Pool({ connectionString }) : undefined

describe.runIf(Boolean(connectionString))(
  "complete Convex PostgreSQL transformation",
  () => {
    beforeAll(async () => {
      await migrateDatabase({ connectionString: connectionString! })
      await pool!.query(`
        TRUNCATE
          audit.record_reversals,
          audit.legacy_convex_corrections,
          manufacturing.route_selections,
          manufacturing.production_entries,
          manufacturing.shop_floor_stage_events,
          manufacturing.shop_floor_setup_state,
          manufacturing.raw_material_receipts,
          manufacturing.operation_tooling,
          manufacturing.operation_cycle_standards,
          manufacturing.operation_setups,
          manufacturing.route_options,
          manufacturing.work_orders,
          workforce.employees,
          catalog.machines,
          catalog.items
        CASCADE
      `)
      await pool!.query("DELETE FROM migration.source_id_map")
      await pool!.query("DELETE FROM migration.runs")
      await pool!.query(`
        INSERT INTO core.organizations (code, name)
        VALUES ('MRMPL-CONVEX', 'Convex migration fixture')
        ON CONFLICT (lower(code)) DO UPDATE SET name = EXCLUDED.name
      `)
    })

    afterAll(async () => {
      await Promise.all(
        temporaryDirectories
          .splice(0)
          .map((directory) => rm(directory, { force: true, recursive: true }))
      )
      await pool?.end()
    })

    test("normalizes every source row, resolves corrections, and reports production overlap", async () => {
      const directory = await mkdtemp(join(tmpdir(), "mrmpl-convex-transform-"))
      temporaryDirectories.push(directory)
      const artifactPath = join(directory, "convex-export.zip")
      const dataEntries = [
        {
          _creationTime: 1,
          _id: "employee-1",
          entryType: "employee",
          key: "E-1",
          payload: {
            doj: "2026-01-01",
            empId: 1,
            employeeName: "Fixture Operator",
            employeeType: "Employee",
            status: "Active",
          },
        },
        {
          _creationTime: 2,
          _id: "machine-1",
          entryType: "machine_master",
          payload: {
            "M/C NO": "M-1",
            "MACHINE NAME": "Fixture machine",
            "MACHINE TYPE": "CNC",
            Status: "Active",
          },
        },
        {
          _creationTime: 3,
          _id: "work-order-1",
          entryType: "work_order",
          key: "JC-1",
          payload: {
            jcNo: "JC-1",
            orderPcs: 100,
            partCode: "P-1",
          },
        },
        {
          _creationTime: 4,
          _id: "route-1",
          entryType: "route",
          key: "P-1",
          payload: {
            machineType: "CNC",
            machineUsed: "M-1",
            optionNumber: 1,
            partNo: "P-1",
            setupName: "Turning",
            setupNo: 1.1,
          },
        },
        {
          _creationTime: 5,
          _id: "cycle-1",
          entryType: "cycle",
          key: "P-1",
          payload: {
            cycleTime: 10,
            loadingUnloading: 2,
            machineUsed: "M-1",
            optionNumber: 1,
            partNo: "P-1",
            setupName: "Turning",
            setupNo: 1.1,
          },
        },
        {
          _creationTime: 6,
          _id: "tooling-1",
          entryType: "tooling",
          key: "P-1",
          payload: {
            fixture: "F-1",
            fixtureQty: 1,
            machineUsed: "M-1",
            optionNumber: 1,
            partNo: "P-1",
            setupName: "Turning",
            setupNo: 1.1,
            tooling: "T-1",
            toolingQty: 1,
          },
        },
        {
          _creationTime: 7,
          _id: "rm-1",
          entryType: "rm_inward",
          key: "JC-1",
          payload: {
            jcNo: "JC-1",
            partCode: "P-1",
            rmInwardDate: "",
            rmInwardKg: "",
            rmPoNo: "RM-1",
          },
        },
        {
          _creationTime: 8,
          _id: "shop-1",
          entryType: "shop_floor_status",
          key: "jc-1|p-1|1|1.1|m-1",
          payload: {
            completedAt: "2026-07-18T10:00:00.000Z",
            doneBy: "Fixture Planner",
            jcNo: "JC-1",
            machine: "M-1",
            optionNumber: "1",
            partCode: "P-1",
            setupName: "Turning",
            setupNo: "1.1",
            stage: "operator_started",
          },
        },
        {
          _creationTime: 9,
          _id: "quarantine-1",
          entryType: "rejection_classification",
          payload: {
            CODE: "D-1",
            Type: "Rejection Reason",
            "Rejection Reason": "Length plus",
          },
        },
        {
          _creationTime: 10,
          _id: "summary-1",
          entryType: "_summary",
          payload: { count: 9 },
        },
      ]
      await writeFile(
        artifactPath,
        zipSync({
          "corrections/documents.jsonl": strToU8(
            `${JSON.stringify({
              _creationTime: 12,
              _id: "correction-1",
              action: "reverse",
              correctedBy: "Fixture Planner",
              createdAt: "2026-07-18T12:00:00.000Z",
              reason: "fixture correction",
              targetId: "shop-1",
              targetTable: "dataEntries",
            })}\n`
          ),
          "dataEntries/documents.jsonl": strToU8(
            `${dataEntries.map((row) => JSON.stringify(row)).join("\n")}\n`
          ),
          "productionEntries/documents.jsonl": strToU8(
            `${JSON.stringify({
              _creationTime: 11,
              _id: "production-1",
              actualQty: 25,
              createdAt: "2026-07-18T11:00:00.000Z",
              jobCard: "JC-1",
              machine: "M-1",
              operatorId: "1",
              outputQty: 25,
              partCode: "P-1",
              prodDate: "2026-07-18",
              rejectQty: 0,
              setupNo: "1.1",
            })}\n`
          ),
          "routeSelections/documents.jsonl": strToU8(
            `${JSON.stringify({
              _creationTime: 13,
              _id: "selection-1",
              createdAt: "2026-07-18T09:00:00.000Z",
              jcNo: "JC-1",
              optionNumber: "1",
            })}\n`
          ),
        })
      )

      const migrationRunId = await createMigrationRun({
        connectionString: connectionString!,
        gitCommit: "fixture-commit",
        operator: "migration-test",
        targetMigrationVersion: "0010",
      })
      await stageConvexExport({
        artifactPath,
        connectionString: connectionString!,
        migrationRunId,
      })

      const options = {
        connectionString: connectionString!,
        migrationRunId,
        organizationCode: "MRMPL-CONVEX",
        transformationVersion: "convex-snapshot-v1",
      }
      const first = await transformConvexSnapshot(options)
      const second = await transformConvexSnapshot(options)

      expect(second).toEqual(first)
      expect(first).toMatchObject({
        archiveOnlyRows: 1,
        hashMatches: 12,
        orphanCorrections: 0,
        physicalProductionRows: 1,
        quarantinedRows: 1,
        resolvedCorrections: 1,
        softwareProductionRows: 0,
        sourceMappings: 12,
        sourceRows: 12,
        unknownEntryTypes: 0,
      })

      const operation = await pool!.query<{
        cycle_row_version: string
        cycle_time_seconds: string
        legacy_setup_code: string
        reversal_reason: string
        setup_row_version: string
      }>(`
        SELECT
          setup.legacy_setup_code,
          setup.row_version AS setup_row_version,
          cycle.cycle_time_seconds::text,
          cycle.row_version AS cycle_row_version,
          reversal.reason AS reversal_reason
        FROM manufacturing.operation_setups AS setup
        JOIN manufacturing.operation_cycle_standards AS cycle
          ON cycle.operation_setup_id = setup.id
        CROSS JOIN audit.record_reversals AS reversal
        WHERE setup.source_id = 'route-1'
      `)
      expect(operation.rows).toEqual([
        {
          cycle_row_version: "1",
          cycle_time_seconds: "10.00000000",
          legacy_setup_code: "1.1",
          reversal_reason: "fixture correction",
          setup_row_version: "1",
        },
      ])
    })
  }
)
