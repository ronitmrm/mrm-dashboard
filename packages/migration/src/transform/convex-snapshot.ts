import { Pool } from "pg"

import { transformConvexFoundation } from "./convex-foundation"
import { transformConvexLogicalRows } from "./convex-logical"
import { transformConvexPhysicalRows } from "./convex-physical"
import { reconcileConvexSnapshot } from "./convex-reconciliation"

type TransformConvexSnapshotOptions = {
  connectionString: string
  migrationRunId: string
  organizationCode: string
  transformationVersion: string
}

export type ConvexSnapshotTransformationResult = {
  archiveOnlyRows: number
  hashMatches: number
  orphanCorrections: number
  physicalProductionRows: number
  quarantinedRows: number
  resolvedCorrections: number
  softwareProductionRows: number
  sourceMappings: number
  sourceRows: number
  unknownEntryTypes: number
}

export async function transformConvexSnapshot(
  options: TransformConvexSnapshotOptions
): Promise<ConvexSnapshotTransformationResult> {
  const pool = new Pool({ connectionString: options.connectionString })
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const run = await client.query<{ id: string }>(
      "SELECT id FROM migration.runs WHERE id = $1 FOR UPDATE",
      [options.migrationRunId]
    )
    if (run.rowCount !== 1) {
      throw new Error(`Migration run not found: ${options.migrationRunId}`)
    }
    const organization = await client.query<{ id: string }>(
      "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
      [options.organizationCode.trim()]
    )
    const organizationId = organization.rows[0]?.id
    if (!organizationId) {
      throw new Error(
        `Organization not found: ${options.organizationCode.trim()}`
      )
    }

    const transformOptions = {
      migrationRunId: options.migrationRunId,
      organizationId,
    }
    await transformConvexFoundation(client, transformOptions)
    await transformConvexLogicalRows(client, transformOptions)
    await transformConvexPhysicalRows(client, transformOptions)
    await reconcileConvexSnapshot(client, {
      ...transformOptions,
      transformationVersion: options.transformationVersion,
    })

    const summary = await client.query<{
      archive_only_rows: string
      hash_matches: string
      orphan_corrections: string
      physical_production_rows: string
      quarantined_rows: string
      resolved_corrections: string
      software_production_rows: string
      source_mappings: string
      source_rows: string
      unknown_entry_types: string
    }>(
      `
        SELECT
          (
            SELECT count(*)::text
            FROM migration.convex_documents
            WHERE migration_run_id = $1
              AND source_table = 'dataEntries'
              AND document->>'entryType' = '_summary'
          ) AS archive_only_rows,
          (
            SELECT count(*)::text
            FROM migration.source_hashes
            WHERE migration_run_id = $1
              AND source_system = 'convex'
              AND source_hash = target_hash
          ) AS hash_matches,
          (
            SELECT count(*)::text
            FROM migration.orphan_corrections
            WHERE migration_run_id = $1
          ) AS orphan_corrections,
          (
            SELECT count(*)::text
            FROM migration.convex_documents
            WHERE migration_run_id = $1
              AND source_table = 'productionEntries'
          ) AS physical_production_rows,
          (
            SELECT count(*)::text
            FROM migration.type_conflicts
            WHERE migration_run_id = $1
              AND source_system = 'convex'
              AND status = 'approved'
          ) AS quarantined_rows,
          (
            SELECT count(*)::text
            FROM audit.legacy_convex_corrections target
            WHERE target.source_id IN (
              SELECT source_id FROM migration.convex_documents
              WHERE migration_run_id = $1
                AND source_table = 'corrections'
            )
              AND target.resolved
          ) AS resolved_corrections,
          (
            SELECT count(*)::text
            FROM migration.convex_documents
            WHERE migration_run_id = $1
              AND source_table = 'dataEntries'
              AND document->>'entryType' = 'software_raw'
          ) AS software_production_rows,
          (
            SELECT count(*)::text
            FROM migration.source_id_map
            WHERE migration_run_id = $1
              AND source_system = 'convex'
          ) AS source_mappings,
          (
            SELECT count(*)::text
            FROM migration.convex_documents
            WHERE migration_run_id = $1
              AND NOT (
                source_table = 'dataEntries'
                AND document->>'entryType' = '_summary'
              )
          ) AS source_rows,
          (
            SELECT count(*)::text
            FROM migration.unknown_entry_types
            WHERE migration_run_id = $1
              AND status = 'open'
          ) AS unknown_entry_types
      `,
      [options.migrationRunId]
    )
    const row = summary.rows[0]
    if (!row) {
      throw new Error("Convex transformation summary was not produced")
    }
    await client.query(
      `UPDATE migration.runs
       SET status = 'complete', completed_at = now()
       WHERE id = $1`,
      [options.migrationRunId]
    )
    await client.query("COMMIT")
    return {
      archiveOnlyRows: Number(row.archive_only_rows),
      hashMatches: Number(row.hash_matches),
      orphanCorrections: Number(row.orphan_corrections),
      physicalProductionRows: Number(row.physical_production_rows),
      quarantinedRows: Number(row.quarantined_rows),
      resolvedCorrections: Number(row.resolved_corrections),
      softwareProductionRows: Number(row.software_production_rows),
      sourceMappings: Number(row.source_mappings),
      sourceRows: Number(row.source_rows),
      unknownEntryTypes: Number(row.unknown_entry_types),
    }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}
