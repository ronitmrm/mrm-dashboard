import { createHash, randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { resetTestDatabase } from "../../../scripts/test-database-safety"

import {
  ArtifactStorageError,
  type ArtifactStorageProvider,
  type ArtifactStoredObjectProvider,
} from "./artifacts"
import {
  createArtifactStorageMigrationRepository,
  createArtifactStorageMigrationService,
} from "./artifact-storage-migration"
import { migrateDatabase } from "./migrate"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString })

class LegacyProvider implements ArtifactStoredObjectProvider {
  readonly identifier = "uploadthing"
  readonly objects = new Map<string, Buffer>()
  readonly publicStatuses = new Map<string, number>()
  deleteCalls = 0
  failDeletes = false
  retainPublicCopyAfterDelete = false
  readCalls = 0

  async delete({ key }: { key: string }) {
    this.deleteCalls += 1
    if (this.failDeletes) throw new Error("synthetic source deletion failure")
    this.objects.delete(key)
    if (!this.retainPublicCopyAfterDelete) {
      for (const url of this.publicStatuses.keys()) {
        this.publicStatuses.set(url, 410)
      }
    }
  }

  async read({ key }: { key: string }) {
    this.readCalls += 1
    const bytes = this.objects.get(key)
    if (!bytes) {
      throw new ArtifactStorageError("not-found", "Synthetic source missing.")
    }
    return Buffer.from(bytes)
  }

  fetch: typeof fetch = async (input) => {
    const status = this.publicStatuses.get(String(input)) ?? 404
    return new Response(status === 200 ? "cached bytes" : null, { status })
  }
}

class DestinationProvider implements ArtifactStorageProvider {
  readonly identifier = "google-cloud-storage"
  readonly objects = new Map<string, Buffer>()
  readonly customIds: string[] = []

  async delete({ key }: { key: string }) {
    this.objects.delete(key)
  }

  async read({ key }: { key: string }) {
    const bytes = this.objects.get(key)
    if (!bytes) {
      throw new ArtifactStorageError(
        "not-found",
        "Synthetic destination missing."
      )
    }
    return Buffer.from(bytes)
  }

  async upload(input: Parameters<ArtifactStorageProvider["upload"]>[0]) {
    this.customIds.push(input.customId)
    const key = `artifacts/${createHash("sha256")
      .update(input.customId)
      .digest("hex")}`
    const existing = this.objects.get(key)
    if (existing && !existing.equals(input.bytes)) {
      throw new ArtifactStorageError(
        "integrity-failure",
        "Synthetic destination collision."
      )
    }
    this.objects.set(key, Buffer.from(input.bytes))
    return { key }
  }
}

async function seedLegacyObject(label: string) {
  const suffix = randomUUID()
  const bytes = Buffer.from(`migration-${label}`)
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const organization = await pool.query<{ id: string }>(
    `INSERT INTO core.organizations (code, name) VALUES ($1, $2) RETURNING id`,
    [`MIG-${suffix}`, `${label} migration organization`]
  )
  const organizationId = organization.rows[0]!.id
  const providerKey = `legacy/${suffix}`
  const publicUrl = `https://legacy.example.test/${suffix}`
  const object = await pool.query<{ id: string }>(
    `
      INSERT INTO core.file_objects (
        organization_id, sha256, byte_size, provider, provider_key, public_url
      ) VALUES ($1, $2, $3, 'uploadthing', $4, $5)
      RETURNING id
    `,
    [organizationId, sha256, bytes.byteLength, providerKey, publicUrl]
  )
  const physicalObjectId = object.rows[0]!.id
  const targetId = randomUUID()
  for (const [index, lifecycle] of ["superseded", "current"].entries()) {
    const file = await pool.query<{ id: string }>(
      `
        INSERT INTO core.files (
          organization_id, file_name, media_type, byte_size, sha256,
          storage_key, source_system, source_table, source_id,
          source_payload, physical_object_id, origin, lifecycle_state
        ) VALUES (
          $1, $2, 'application/pdf', $3, $4, $5,
          'artifact-service', 'artifacts', $6, $7, $8, 'uploaded', $9
        )
        RETURNING id
      `,
      [
        organizationId,
        `${label}-${index + 1}.pdf`,
        bytes.byteLength,
        sha256,
        `unchanged-storage-key-${index + 1}`,
        `${organizationId}:${suffix}:${index + 1}`,
        { preserved: index + 1 },
        physicalObjectId,
        lifecycle,
      ]
    )
    await pool.query(
      `
        INSERT INTO core.file_links (
          organization_id, file_id, target_schema, target_table,
          target_id, purpose, version, is_current
        ) VALUES ($1, $2, 'sales', 'enquiry_items', $3, 'drawing', $4, $5)
      `,
      [organizationId, file.rows[0]!.id, targetId, index + 1, index === 1]
    )
  }
  return {
    bytes,
    organizationId,
    physicalObjectId,
    providerKey,
    publicUrl,
    sha256,
  }
}

async function logicalSnapshot(physicalObjectId: string) {
  return (
    await pool.query(
      `
        SELECT file.id, file.file_name, file.media_type,
          file.byte_size::text, file.sha256, file.storage_key,
          file.source_system, file.source_table, file.source_id,
          file.source_payload, file.physical_object_id, file.origin,
          file.lifecycle_state, file.deleted_at, file.deletion_reason,
          link.id AS link_id, link.target_schema, link.target_table,
          link.target_id, link.purpose, link.version, link.is_current,
          link.deactivated_at
        FROM core.files file
        JOIN core.file_links link ON link.file_id = file.id
        WHERE file.physical_object_id = $1
        ORDER BY link.version, file.id
      `,
      [physicalObjectId]
    )
  ).rows
}

beforeAll(async () => {
  await resetTestDatabase(pool, connectionString)
  await migrateDatabase({ connectionString })
}, 120_000)

afterAll(async () => {
  await pool.end()
})

describe("Artifact storage migration", () => {
  test("migrates one shared physical object once without changing logical records", async () => {
    const seeded = await seedLegacyObject("shared")
    const before = await logicalSnapshot(seeded.physicalObjectId)
    const source = new LegacyProvider()
    source.objects.set(seeded.providerKey, seeded.bytes)
    source.publicStatuses.set(seeded.publicUrl, 200)
    const destination = new DestinationProvider()
    const repository = createArtifactStorageMigrationRepository({
      connectionString,
    })
    const service = createArtifactStorageMigrationService({
      destinationProvider: destination,
      fetchImplementation: source.fetch,
      repository,
      sourceProvider: source,
    })

    try {
      const result = await service.migrateBatch({ limit: 10 })

      expect(result).toMatchObject({
        failures: [],
        migrated: 1,
        reconciledCleanups: 1,
      })
      expect(source.readCalls).toBe(1)
      expect(source.deleteCalls).toBe(1)
      expect(destination.customIds).toEqual([
        `${seeded.organizationId}:${seeded.sha256}:${seeded.bytes.byteLength}`,
      ])
      expect(await logicalSnapshot(seeded.physicalObjectId)).toEqual(before)
      const locator = await pool.query(
        `SELECT id, provider, public_url FROM core.file_objects WHERE id = $1`,
        [seeded.physicalObjectId]
      )
      expect(locator.rows[0]).toEqual({
        id: seeded.physicalObjectId,
        provider: "google-cloud-storage",
        public_url: null,
      })
      const cleanup = await pool.query(
        `SELECT status, attempt_count, last_error
         FROM migration.artifact_source_cleanups
         WHERE physical_object_id = $1`,
        [seeded.physicalObjectId]
      )
      expect(cleanup.rows[0]).toEqual({
        attempt_count: 1,
        last_error: null,
        status: "complete",
      })
    } finally {
      await repository.close()
    }
  })

  test("retries ambiguous source cleanup and a completion commit gap without recopying", async () => {
    const seeded = await seedLegacyObject("recovery")
    const before = await logicalSnapshot(seeded.physicalObjectId)
    const source = new LegacyProvider()
    source.objects.set(seeded.providerKey, seeded.bytes)
    source.publicStatuses.set(seeded.publicUrl, 200)
    source.failDeletes = true
    source.retainPublicCopyAfterDelete = true
    const destination = new DestinationProvider()
    const repository = createArtifactStorageMigrationRepository({
      connectionString,
    })
    let failCompletionCommit = false
    const faultedRepository = {
      ...repository,
      async markSourceCleanupComplete(
        ...arguments_: Parameters<typeof repository.markSourceCleanupComplete>
      ) {
        if (failCompletionCommit) {
          failCompletionCommit = false
          throw new Error("synthetic completion commit gap")
        }
        return repository.markSourceCleanupComplete(...arguments_)
      },
    }
    const service = createArtifactStorageMigrationService({
      destinationProvider: destination,
      fetchImplementation: source.fetch,
      repository: faultedRepository,
      sourceProvider: source,
    })

    try {
      const first = await service.migrateBatch({ limit: 10 })
      expect(first.failures).toEqual([
        {
          code: "source-cleanup-failed",
          physicalObjectId: seeded.physicalObjectId,
        },
      ])

      source.failDeletes = false
      source.retainPublicCopyAfterDelete = false
      failCompletionCommit = true
      const second = await service.reconcile({ limit: 10 })
      expect(second.failures).toEqual([
        {
          code: "cleanup-commit-failed",
          physicalObjectId: seeded.physicalObjectId,
        },
      ])

      const third = await service.reconcile({ limit: 10 })
      expect(third).toMatchObject({ failures: [], reconciledCleanups: 1 })
      expect(destination.customIds).toHaveLength(1)
      expect(await logicalSnapshot(seeded.physicalObjectId)).toEqual(before)
      const cleanup = await pool.query<{ status: string }>(
        `SELECT status FROM migration.artifact_source_cleanups
         WHERE physical_object_id = $1`,
        [seeded.physicalObjectId]
      )
      expect(cleanup.rows[0]?.status).toBe("complete")
    } finally {
      await repository.close()
    }
  })
})
