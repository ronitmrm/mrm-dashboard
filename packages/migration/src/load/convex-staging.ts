import { readFile } from "node:fs/promises"

import { strFromU8, unzipSync } from "fflate"
import { Pool, type PoolClient } from "pg"

import { convexTableDisposition, inspectConvexExport } from "../convex-export"
import { convexDataEntryDisposition } from "../data-entry-classification"

type CreateMigrationRunOptions = {
  connectionString: string
  gitCommit: string
  operator: string
  targetMigrationVersion: string
}

type StageConvexExportOptions = {
  artifactPath: string
  connectionString: string
  migrationRunId: string
}

export type ConvexStagingResult = {
  artifactId: string
  migrationRunId: string
  stagedRowsByTable: Record<string, number>
  unknownEntryTypes: Record<string, number>
}

type ConvexDocument = Record<string, unknown> & {
  _creationTime?: number
  _id: string
}

function parseDocuments(table: string, contents: Uint8Array) {
  return strFromU8(contents)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index): ConvexDocument => {
      const document: unknown = JSON.parse(line)

      if (
        typeof document !== "object" ||
        document === null ||
        Array.isArray(document) ||
        typeof Reflect.get(document, "_id") !== "string"
      ) {
        throw new Error(
          `Invalid Convex document in ${table} on line ${index + 1}`
        )
      }

      return document as ConvexDocument
    })
}

function unknownEntryTypes(dataEntryTypes: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(dataEntryTypes).filter(
      ([entryType]) => convexDataEntryDisposition(entryType) === "unknown"
    )
  )
}

async function upsertDocuments(
  client: PoolClient,
  options: {
    artifactId: string
    documents: ConvexDocument[]
    migrationRunId: string
    table: string
  }
) {
  const batchSize = 500

  for (let offset = 0; offset < options.documents.length; offset += batchSize) {
    const batch = options.documents.slice(offset, offset + batchSize)

    await client.query(
      `
        INSERT INTO migration.convex_documents (
          migration_run_id,
          artifact_id,
          source_table,
          source_id,
          source_creation_time,
          document
        )
        SELECT
          $1::uuid,
          $2::uuid,
          $3::text,
          document ->> '_id',
          NULLIF(document ->> '_creationTime', '')::numeric,
          document
        FROM jsonb_array_elements($4::jsonb) AS document
        ON CONFLICT (artifact_id, source_table, source_id)
        DO UPDATE SET
          source_creation_time = EXCLUDED.source_creation_time,
          document = EXCLUDED.document,
          staged_at = now()
      `,
      [
        options.migrationRunId,
        options.artifactId,
        options.table,
        JSON.stringify(batch),
      ]
    )
  }
}

export async function createMigrationRun(
  options: CreateMigrationRunOptions
): Promise<string> {
  const pool = new Pool({ connectionString: options.connectionString })

  try {
    const result = await pool.query<{ id: string }>(
      `
        INSERT INTO migration.runs (
          git_commit,
          operator,
          target_migration_version
        )
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [options.gitCommit, options.operator, options.targetMigrationVersion]
    )
    return result.rows[0]!.id
  } finally {
    await pool.end()
  }
}

export async function stageConvexExport(
  options: StageConvexExportOptions
): Promise<ConvexStagingResult> {
  const [artifact, inventory] = await Promise.all([
    readFile(options.artifactPath),
    inspectConvexExport(options.artifactPath),
  ])
  const archive = unzipSync(artifact)
  const stagedRowsByTable: Record<string, number> = {}
  const unknownTypes = unknownEntryTypes(inventory.dataEntryTypes)
  const pool = new Pool({ connectionString: options.connectionString })
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const migrationRun = await client.query<{ id: string }>(
      "SELECT id FROM migration.runs WHERE id = $1 FOR UPDATE",
      [options.migrationRunId]
    )
    if (migrationRun.rowCount !== 1) {
      throw new Error(`Migration run not found: ${options.migrationRunId}`)
    }

    const otherArtifacts = await client.query<{ sha256: string }>(
      `
        SELECT sha256
        FROM migration.artifacts
        WHERE migration_run_id = $1
          AND source_kind = 'convex'
          AND sha256 <> $2
      `,
      [options.migrationRunId, inventory.sha256]
    )
    if (otherArtifacts.rowCount !== 0) {
      throw new Error(
        "Migration run already references a different Convex artifact"
      )
    }

    const artifactResult = await client.query<{ id: string }>(
      `
        INSERT INTO migration.artifacts (
          migration_run_id,
          source_kind,
          artifact_path,
          sha256,
          byte_size,
          table_inventory,
          extract_metadata
        )
        VALUES ($1, 'convex', $2, $3, $4, $5::jsonb, $6::jsonb)
        ON CONFLICT (migration_run_id, source_kind, sha256)
        DO UPDATE SET
          artifact_path = EXCLUDED.artifact_path,
          byte_size = EXCLUDED.byte_size,
          table_inventory = EXCLUDED.table_inventory,
          extract_metadata = EXCLUDED.extract_metadata
        RETURNING id
      `,
      [
        options.migrationRunId,
        options.artifactPath,
        inventory.sha256,
        inventory.byteSize,
        JSON.stringify(inventory.tables),
        JSON.stringify({
          dataEntryDispositions: inventory.dataEntryDispositions,
          dataEntryProfiles: inventory.dataEntryProfiles,
          dataEntryTypes: inventory.dataEntryTypes,
          workingTables: inventory.workingTables,
        }),
      ]
    )
    const artifactId = artifactResult.rows[0]!.id

    for (const [path, contents] of Object.entries(archive)) {
      if (!path.endsWith("/documents.jsonl")) {
        continue
      }

      const table = path.slice(0, -"/documents.jsonl".length)
      if (convexTableDisposition(table) !== "canonical") {
        continue
      }

      const documents = parseDocuments(table, contents)
      stagedRowsByTable[table] = documents.length
      await upsertDocuments(client, {
        artifactId,
        documents,
        migrationRunId: options.migrationRunId,
        table,
      })
    }

    await client.query(
      "DELETE FROM migration.unknown_entry_types WHERE migration_run_id = $1",
      [options.migrationRunId]
    )
    for (const [entryType, rowCount] of Object.entries(unknownTypes)) {
      await client.query(
        `
          INSERT INTO migration.unknown_entry_types (
            migration_run_id,
            entry_type,
            row_count,
            evidence
          )
          VALUES ($1, $2, $3, $4::jsonb)
        `,
        [
          options.migrationRunId,
          entryType,
          rowCount,
          JSON.stringify({
            artifactId,
            artifactSha256: inventory.sha256,
          }),
        ]
      )
    }

    await client.query(
      "UPDATE migration.runs SET status = 'staging' WHERE id = $1",
      [options.migrationRunId]
    )
    await client.query("COMMIT")

    return {
      artifactId,
      migrationRunId: options.migrationRunId,
      stagedRowsByTable,
      unknownEntryTypes: unknownTypes,
    }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}
