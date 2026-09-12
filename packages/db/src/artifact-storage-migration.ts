import { createHash } from "node:crypto"

import { Pool, type PoolClient } from "pg"

import {
  ArtifactStorageError,
  type ArtifactStorageProvider,
  type ArtifactStorageProviderIdentifier,
} from "./artifacts"

const destinationProvider = "google-cloud-storage" as const
const sourceProvider = "uploadthing" as const

type ObjectLifecycle = "available" | "deleted" | "deletion_failed"
type CleanupStatus = "complete" | "pending"

type PhysicalObjectRow = {
  byte_size: string
  deleted_reference_count: string
  id: string
  lifecycle_state: string
  live_reference_count: string
  organization_id: string
  provider: string
  provider_key: string
  public_url: string | null
  sha256: string
  current_reference_count: string
  superseded_reference_count: string
}

type CleanupRow = {
  attempt_count: number
  destination_provider: string
  destination_provider_key: string
  expected_byte_size: string
  expected_sha256: string
  id: string
  last_error: string | null
  physical_object_id: string
  source_provider: string
  source_provider_key: string
  source_public_url: string | null
  status: CleanupStatus
}

export type ArtifactStorageMigrationObject = {
  byteSize: number
  lifecycleState: ObjectLifecycle
  liveReferenceCount: number
  organizationId: string
  physicalObjectId: string
  provider: ArtifactStorageProviderIdentifier
  providerKey: string
  publicUrl: string | null
  sha256: string
}

export type ArtifactSourceCleanup = {
  attemptCount: number
  destinationProvider: typeof destinationProvider
  destinationProviderKey: string
  expectedByteSize: number
  expectedSha256: string
  id: string
  lastError: string | null
  physicalObjectId: string
  sourceProvider: ArtifactStorageProviderIdentifier
  sourceProviderKey: string
  sourcePublicUrl: string | null
  status: CleanupStatus
}

export type ArtifactStorageMigrationInventory = {
  cleanupSchemaAvailable: boolean
  cleanup: {
    complete: number
    failed: number
    pending: number
  }
  legacyLogicalWithoutPhysicalObject: {
    deleted: number
    live: number
  }
  logicalReferences: {
    current: number
    deleted: number
    superseded: number
  }
  metadataBlockers: readonly {
    code: string
    physicalObjectId?: string
  }[]
  physicalObjects: readonly {
    byteSize: string
    count: number
    lifecycleState: string
    maximumByteSize: string | null
    minimumByteSize: string | null
    provider: string
  }[]
  live: {
    byteSize: string
    googleCloudStorageObjects: number
    objectCount: number
    uploadThingObjects: number
  }
  tombstoneObjects: number
}

export type ArtifactStorageMigrationResult = {
  failures: readonly {
    code: string
    physicalObjectId: string
  }[]
  migrated: number
  processed: number
  reconciledCleanups: number
  recoveredDeletions: number
  remaining: boolean
}

export type ArtifactStorageReadiness = {
  complete: boolean
  integrity: {
    checked: number
    failures: readonly {
      code: string
      physicalObjectId: string
    }[]
  }
  inventory: ArtifactStorageMigrationInventory
}

function count(value: string) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("Artifact migration count is outside the supported range.")
  }
  return parsed
}

function byteSize(value: string) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("Artifact byte size is outside the supported range.")
  }
  return parsed
}

function isProvider(value: string): value is ArtifactStorageProviderIdentifier {
  return value === destinationProvider || value === sourceProvider
}

function isLifecycle(value: string): value is ObjectLifecycle {
  return (
    value === "available" || value === "deleted" || value === "deletion_failed"
  )
}

function validSourcePublicUrl(
  value: string | null,
  providerKey: string
): value is string {
  if (!value || !providerKey || providerKey.trim() !== providerKey) return false
  try {
    const url = new URL(value)
    const sourceHost =
      url.hostname === "utfs.io" ||
      (url.hostname.endsWith(".ufs.sh") && url.hostname !== "ufs.sh")
    const encodedKey = url.pathname.startsWith("/f/")
      ? url.pathname.slice(3)
      : null
    return (
      url.protocol === "https:" &&
      sourceHost &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search &&
      encodedKey !== null &&
      decodeURIComponent(encodedKey) === providerKey
    )
  } catch {
    return false
  }
}

function objectResult(row: PhysicalObjectRow): ArtifactStorageMigrationObject {
  if (!isProvider(row.provider) || !isLifecycle(row.lifecycle_state)) {
    throw new Error("Artifact storage locator metadata is unsupported.")
  }
  return {
    byteSize: byteSize(row.byte_size),
    lifecycleState: row.lifecycle_state,
    liveReferenceCount: count(row.live_reference_count),
    organizationId: row.organization_id,
    physicalObjectId: row.id,
    provider: row.provider,
    providerKey: row.provider_key,
    publicUrl: row.public_url,
    sha256: row.sha256,
  }
}

function cleanupResult(row: CleanupRow): ArtifactSourceCleanup {
  if (!isProvider(row.source_provider)) {
    throw new Error("Artifact source cleanup provider is unsupported.")
  }
  if (row.destination_provider !== destinationProvider) {
    throw new Error("Artifact destination cleanup provider is unsupported.")
  }
  return {
    attemptCount: row.attempt_count,
    destinationProvider,
    destinationProviderKey: row.destination_provider_key,
    expectedByteSize: byteSize(row.expected_byte_size),
    expectedSha256: row.expected_sha256,
    id: row.id,
    lastError: row.last_error,
    physicalObjectId: row.physical_object_id,
    sourceProvider: row.source_provider,
    sourceProviderKey: row.source_provider_key,
    sourcePublicUrl: row.source_public_url,
    status: row.status,
  }
}

const physicalObjectColumns = `
  object.id, object.organization_id, object.sha256,
  object.byte_size::text, object.provider, object.provider_key,
  object.public_url, object.lifecycle_state,
  count(file.id) FILTER (
    WHERE file.lifecycle_state <> 'deleted'
  )::text AS live_reference_count,
  count(file.id) FILTER (
    WHERE file.lifecycle_state = 'current'
  )::text AS current_reference_count,
  count(file.id) FILTER (
    WHERE file.lifecycle_state = 'superseded'
  )::text AS superseded_reference_count,
  count(file.id) FILTER (
    WHERE file.lifecycle_state = 'deleted'
  )::text AS deleted_reference_count
`

const cleanupColumns = `
  cleanup.id, cleanup.physical_object_id, cleanup.source_provider,
  cleanup.source_provider_key, cleanup.source_public_url,
  cleanup.expected_sha256, cleanup.expected_byte_size::text,
  cleanup.destination_provider, cleanup.destination_provider_key,
  cleanup.status, cleanup.attempt_count, cleanup.last_error
`

async function lockObject(
  client: PoolClient,
  object: ArtifactStorageMigrationObject
) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
    [object.organizationId, `${object.sha256}:${object.byteSize}`]
  )
  const result = await client.query<
    Omit<
      PhysicalObjectRow,
      | "current_reference_count"
      | "deleted_reference_count"
      | "live_reference_count"
      | "superseded_reference_count"
    >
  >(
    `
      SELECT object.id, object.organization_id, object.sha256,
        object.byte_size::text, object.provider, object.provider_key,
        object.public_url, object.lifecycle_state
      FROM core.file_objects object
      WHERE object.id = $1
      FOR UPDATE OF object
    `,
    [object.physicalObjectId]
  )
  const row = result.rows[0]
  if (!row) return undefined
  const references = await client.query<{
    current_reference_count: string
    deleted_reference_count: string
    live_reference_count: string
    superseded_reference_count: string
  }>(
    `
      SELECT
        count(*) FILTER (WHERE lifecycle_state <> 'deleted')::text
          AS live_reference_count,
        count(*) FILTER (WHERE lifecycle_state = 'current')::text
          AS current_reference_count,
        count(*) FILTER (WHERE lifecycle_state = 'superseded')::text
          AS superseded_reference_count,
        count(*) FILTER (WHERE lifecycle_state = 'deleted')::text
          AS deleted_reference_count
      FROM core.files
      WHERE physical_object_id = $1
    `,
    [object.physicalObjectId]
  )
  return { ...row, ...references.rows[0]! }
}

function sameObject(
  row: PhysicalObjectRow,
  expected: ArtifactStorageMigrationObject
) {
  return (
    row.id === expected.physicalObjectId &&
    row.organization_id === expected.organizationId &&
    row.sha256 === expected.sha256 &&
    row.byte_size === String(expected.byteSize) &&
    row.provider === expected.provider &&
    row.provider_key === expected.providerKey &&
    row.public_url === expected.publicUrl &&
    row.lifecycle_state === expected.lifecycleState &&
    row.live_reference_count === String(expected.liveReferenceCount)
  )
}

function sameCleanupPair(
  row: PhysicalObjectRow,
  cleanup: ArtifactSourceCleanup
) {
  return (
    row.id === cleanup.physicalObjectId &&
    row.sha256 === cleanup.expectedSha256 &&
    row.byte_size === String(cleanup.expectedByteSize) &&
    row.provider === cleanup.destinationProvider &&
    row.provider_key === cleanup.destinationProviderKey &&
    row.public_url === null
  )
}

export function createArtifactStorageMigrationRepository(input: {
  connectionString: string
}) {
  const pool = new Pool({ connectionString: input.connectionString })

  async function schemaStatus() {
    const result = await pool.query<{ available: boolean }>(
      `SELECT to_regclass('migration.artifact_source_cleanups') IS NOT NULL AS available`
    )
    return { cleanupSchemaAvailable: result.rows[0]?.available === true }
  }

  async function physicalObjects() {
    const result = await pool.query<PhysicalObjectRow>(`
      SELECT ${physicalObjectColumns}
      FROM core.file_objects object
      LEFT JOIN core.files file ON file.physical_object_id = object.id
      GROUP BY object.id
      ORDER BY object.id
    `)
    return result.rows
  }

  async function inventory(): Promise<ArtifactStorageMigrationInventory> {
    const [schema, objects, logical] = await Promise.all([
      schemaStatus(),
      physicalObjects(),
      pool.query<{
        current_count: string
        deleted_count: string
        legacy_deleted_count: string
        legacy_live_count: string
        superseded_count: string
      }>(`
        SELECT
          count(*) FILTER (WHERE lifecycle_state = 'current')::text AS current_count,
          count(*) FILTER (WHERE lifecycle_state = 'superseded')::text AS superseded_count,
          count(*) FILTER (WHERE lifecycle_state = 'deleted')::text AS deleted_count,
          count(*) FILTER (
            WHERE physical_object_id IS NULL AND lifecycle_state <> 'deleted'
          )::text AS legacy_live_count,
          count(*) FILTER (
            WHERE physical_object_id IS NULL AND lifecycle_state = 'deleted'
          )::text AS legacy_deleted_count
        FROM core.files
      `),
    ])

    const cleanupRows = schema.cleanupSchemaAvailable
      ? (
          await pool.query<CleanupRow>(`
            SELECT ${cleanupColumns}
            FROM migration.artifact_source_cleanups cleanup
            ORDER BY cleanup.id
          `)
        ).rows
      : []
    const cleanupByObject = new Map(
      cleanupRows.map((cleanup) => [cleanup.physical_object_id, cleanup])
    )
    const blockers: Array<{ code: string; physicalObjectId?: string }> = []
    if (!schema.cleanupSchemaAvailable) {
      blockers.push({ code: "cleanup-schema-unavailable" })
    }

    const aggregates = new Map<
      string,
      {
        byteSize: bigint
        count: number
        lifecycleState: string
        maximumByteSize: bigint | null
        minimumByteSize: bigint | null
        provider: string
      }
    >()
    let liveByteSize = 0n
    let liveObjectCount = 0
    let liveGoogleCloudStorage = 0
    let liveUploadThing = 0
    let tombstoneObjects = 0

    for (const object of objects) {
      const size = BigInt(object.byte_size)
      const aggregateKey = `${object.provider}\u0000${object.lifecycle_state}`
      const aggregate = aggregates.get(aggregateKey) ?? {
        byteSize: 0n,
        count: 0,
        lifecycleState: object.lifecycle_state,
        maximumByteSize: null,
        minimumByteSize: null,
        provider: object.provider,
      }
      aggregate.byteSize += size
      aggregate.count += 1
      aggregate.maximumByteSize =
        aggregate.maximumByteSize === null || size > aggregate.maximumByteSize
          ? size
          : aggregate.maximumByteSize
      aggregate.minimumByteSize =
        aggregate.minimumByteSize === null || size < aggregate.minimumByteSize
          ? size
          : aggregate.minimumByteSize
      aggregates.set(aggregateKey, aggregate)

      const liveReferences = count(object.live_reference_count)
      const knownProvider = isProvider(object.provider)
      const knownLifecycle = isLifecycle(object.lifecycle_state)
      const validSha = /^[a-f0-9]{64}$/.test(object.sha256)
      const validSize = Number.isSafeInteger(Number(object.byte_size))
      const validKey = object.provider_key.trim().length > 0
      const validProviderLocator =
        (object.provider === sourceProvider &&
          validSourcePublicUrl(object.public_url, object.provider_key)) ||
        (object.provider === destinationProvider && object.public_url === null)

      if (
        !knownProvider ||
        !knownLifecycle ||
        !validSha ||
        !validSize ||
        !validKey ||
        !validProviderLocator
      ) {
        blockers.push({
          code: "invalid-physical-locator",
          physicalObjectId: object.id,
        })
      }
      if (object.lifecycle_state === "deleted") tombstoneObjects += 1
      if (liveReferences > 0) {
        liveObjectCount += 1
        liveByteSize += size
        if (object.provider === sourceProvider) liveUploadThing += 1
        if (object.provider === destinationProvider) liveGoogleCloudStorage += 1
        if (object.lifecycle_state === "deleted") {
          blockers.push({
            code: "deleted-object-has-live-references",
            physicalObjectId: object.id,
          })
        }
        if (object.lifecycle_state === "deletion_failed") {
          blockers.push({
            code: "deletion-failed-object-has-live-references",
            physicalObjectId: object.id,
          })
        }
      } else if (object.lifecycle_state === "available") {
        blockers.push({
          code: "available-object-has-no-live-references",
          physicalObjectId: object.id,
        })
      } else if (object.lifecycle_state === "deletion_failed") {
        blockers.push({
          code: "deletion-failed-object-has-no-live-references",
          physicalObjectId: object.id,
        })
      }

      const cleanup = cleanupByObject.get(object.id)
      if (
        cleanup &&
        (cleanup.source_provider !== sourceProvider ||
          !validSourcePublicUrl(
            cleanup.source_public_url,
            cleanup.source_provider_key
          ) ||
          cleanup.expected_sha256 !== object.sha256 ||
          cleanup.expected_byte_size !== object.byte_size ||
          cleanup.destination_provider !== object.provider ||
          cleanup.destination_provider_key !== object.provider_key ||
          object.public_url !== null ||
          cleanup.source_provider === cleanup.destination_provider)
      ) {
        blockers.push({
          code: "inconsistent-migration-pair",
          physicalObjectId: object.id,
        })
      }
    }

    const logicalRow = logical.rows[0]!
    return {
      cleanupSchemaAvailable: schema.cleanupSchemaAvailable,
      cleanup: {
        complete: cleanupRows.filter((row) => row.status === "complete").length,
        failed: cleanupRows.filter(
          (row) => row.status === "pending" && row.last_error !== null
        ).length,
        pending: cleanupRows.filter((row) => row.status === "pending").length,
      },
      legacyLogicalWithoutPhysicalObject: {
        deleted: count(logicalRow.legacy_deleted_count),
        live: count(logicalRow.legacy_live_count),
      },
      logicalReferences: {
        current: count(logicalRow.current_count),
        deleted: count(logicalRow.deleted_count),
        superseded: count(logicalRow.superseded_count),
      },
      metadataBlockers: blockers,
      physicalObjects: [...aggregates.values()]
        .sort((left, right) =>
          `${left.provider}:${left.lifecycleState}`.localeCompare(
            `${right.provider}:${right.lifecycleState}`
          )
        )
        .map((aggregate) => ({
          byteSize: String(aggregate.byteSize),
          count: aggregate.count,
          lifecycleState: aggregate.lifecycleState,
          maximumByteSize:
            aggregate.maximumByteSize === null
              ? null
              : String(aggregate.maximumByteSize),
          minimumByteSize:
            aggregate.minimumByteSize === null
              ? null
              : String(aggregate.minimumByteSize),
          provider: aggregate.provider,
        })),
      live: {
        byteSize: String(liveByteSize),
        googleCloudStorageObjects: liveGoogleCloudStorage,
        objectCount: liveObjectCount,
        uploadThingObjects: liveUploadThing,
      },
      tombstoneObjects,
    }
  }

  async function listLiveObjects(input: {
    afterId?: string
    limit: number
    provider: ArtifactStorageProviderIdentifier
  }) {
    const result = await pool.query<PhysicalObjectRow>(
      `
        SELECT ${physicalObjectColumns}
        FROM core.file_objects object
        JOIN core.files file ON file.physical_object_id = object.id
        WHERE object.provider = $1 AND object.lifecycle_state = 'available'
          AND file.lifecycle_state <> 'deleted'
          AND ($2::uuid IS NULL OR object.id > $2)
        GROUP BY object.id
        ORDER BY object.id
        LIMIT $3
      `,
      [input.provider, input.afterId ?? null, input.limit + 1]
    )
    const rows = result.rows.slice(0, input.limit)
    return {
      items: rows.map(objectResult),
      nextAfterId:
        result.rows.length > input.limit ? (rows.at(-1)?.id ?? null) : null,
    }
  }

  async function listPendingSourceCleanups(input: { limit: number }) {
    if (!(await schemaStatus()).cleanupSchemaAvailable) return []
    const result = await pool.query<CleanupRow>(
      `
        SELECT ${cleanupColumns}
        FROM migration.artifact_source_cleanups cleanup
        WHERE cleanup.status = 'pending'
        ORDER BY cleanup.created_at, cleanup.id
        LIMIT $1
      `,
      [input.limit]
    )
    return result.rows.map(cleanupResult)
  }

  async function listDeletionFailedOrphans(input: { limit: number }) {
    const result = await pool.query<PhysicalObjectRow>(
      `
        SELECT ${physicalObjectColumns}
        FROM core.file_objects object
        LEFT JOIN core.files file ON file.physical_object_id = object.id
        WHERE object.lifecycle_state = 'deletion_failed'
        GROUP BY object.id
        HAVING count(file.id) FILTER (
          WHERE file.lifecycle_state <> 'deleted'
        ) = 0
        ORDER BY object.id
        LIMIT $1
      `,
      [input.limit]
    )
    return result.rows.map(objectResult)
  }

  async function commitLocatorMigration(
    object: ArtifactStorageMigrationObject,
    destinationProviderKey: string
  ): Promise<
    | {
        cleanup: ArtifactSourceCleanup
        status: "already-migrated" | "migrated"
      }
    | { status: "discrepancy" }
  > {
    if (
      object.provider !== sourceProvider ||
      object.lifecycleState !== "available" ||
      object.liveReferenceCount < 1 ||
      !destinationProviderKey ||
      !validSourcePublicUrl(object.publicUrl, object.providerKey)
    ) {
      return { status: "discrepancy" }
    }
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const locked = await lockObject(client, object)
      if (!locked) {
        await client.query("ROLLBACK")
        return { status: "discrepancy" }
      }
      const existing = await client.query<CleanupRow>(
        `SELECT ${cleanupColumns}
         FROM migration.artifact_source_cleanups cleanup
         WHERE cleanup.physical_object_id = $1
         FOR UPDATE`,
        [object.physicalObjectId]
      )
      const existingCleanup = existing.rows[0]
      if (existingCleanup) {
        const cleanup = cleanupResult(existingCleanup)
        if (
          locked.provider === destinationProvider &&
          sameCleanupPair(locked, cleanup)
        ) {
          await client.query("COMMIT")
          return { cleanup, status: "already-migrated" }
        }
        await client.query("ROLLBACK")
        return { status: "discrepancy" }
      }
      if (!sameObject(locked, object)) {
        await client.query("ROLLBACK")
        return { status: "discrepancy" }
      }
      const updated = await client.query(
        `
          UPDATE core.file_objects
          SET provider = $2, provider_key = $3, public_url = NULL,
            updated_at = now()
          WHERE id = $1 AND provider = $4 AND provider_key = $5
            AND public_url IS NOT DISTINCT FROM $6
            AND sha256 = $7 AND byte_size = $8
            AND lifecycle_state = 'available'
        `,
        [
          object.physicalObjectId,
          destinationProvider,
          destinationProviderKey,
          sourceProvider,
          object.providerKey,
          object.publicUrl,
          object.sha256,
          object.byteSize,
        ]
      )
      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK")
        return { status: "discrepancy" }
      }
      const cleanup = await client.query<CleanupRow>(
        `
          INSERT INTO migration.artifact_source_cleanups (
            physical_object_id, source_provider, source_provider_key,
            source_public_url, expected_sha256, expected_byte_size,
            destination_provider, destination_provider_key
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING ${cleanupColumns.replaceAll("cleanup.", "")}
        `,
        [
          object.physicalObjectId,
          sourceProvider,
          object.providerKey,
          object.publicUrl,
          object.sha256,
          object.byteSize,
          destinationProvider,
          destinationProviderKey,
        ]
      )
      await client.query("COMMIT")
      return { cleanup: cleanupResult(cleanup.rows[0]!), status: "migrated" }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async function cleanupPairIsCurrent(cleanup: ArtifactSourceCleanup) {
    const result = await pool.query<PhysicalObjectRow>(
      `
        SELECT ${physicalObjectColumns}
        FROM core.file_objects object
        LEFT JOIN core.files file ON file.physical_object_id = object.id
        WHERE object.id = $1
        GROUP BY object.id
      `,
      [cleanup.physicalObjectId]
    )
    const row = result.rows[0]
    return Boolean(row && sameCleanupPair(row, cleanup))
  }

  async function markSourceCleanupComplete(cleanup: ArtifactSourceCleanup) {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const fingerprint = {
        byteSize: cleanup.expectedByteSize,
        lifecycleState: "available" as const,
        liveReferenceCount: 0,
        organizationId: "",
        physicalObjectId: cleanup.physicalObjectId,
        provider: cleanup.destinationProvider,
        providerKey: cleanup.destinationProviderKey,
        publicUrl: null,
        sha256: cleanup.expectedSha256,
      }
      const organization = await client.query<{ organization_id: string }>(
        "SELECT organization_id FROM core.file_objects WHERE id = $1",
        [cleanup.physicalObjectId]
      )
      if (!organization.rows[0]) {
        await client.query("ROLLBACK")
        return false
      }
      fingerprint.organizationId = organization.rows[0].organization_id
      const locked = await lockObject(client, fingerprint)
      const currentCleanup = await client.query<CleanupRow>(
        `SELECT ${cleanupColumns}
         FROM migration.artifact_source_cleanups cleanup
         WHERE cleanup.id = $1 AND cleanup.physical_object_id = $2
         FOR UPDATE`,
        [cleanup.id, cleanup.physicalObjectId]
      )
      if (
        !locked ||
        !currentCleanup.rows[0] ||
        !sameCleanupPair(locked, cleanup)
      ) {
        await client.query("ROLLBACK")
        return false
      }
      await client.query(
        `
          UPDATE migration.artifact_source_cleanups
          SET status = 'complete', attempt_count = attempt_count + 1,
            last_error = NULL, last_attempted_at = now(),
            completed_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'pending'
        `,
        [cleanup.id]
      )
      await client.query("COMMIT")
      return true
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async function recordSourceCleanupFailure(
    cleanup: ArtifactSourceCleanup,
    message: string
  ) {
    await pool.query(
      `
        UPDATE migration.artifact_source_cleanups
        SET attempt_count = attempt_count + 1, last_error = $2,
          last_attempted_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'pending'
      `,
      [cleanup.id, message.slice(0, 500)]
    )
  }

  async function recoverDeletionFailedObject(
    object: ArtifactStorageMigrationObject,
    deleteAndConfirm: () => Promise<void>
  ) {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const locked = await lockObject(client, object)
      if (
        !locked ||
        !sameObject(locked, object) ||
        locked.lifecycle_state !== "deletion_failed" ||
        locked.live_reference_count !== "0"
      ) {
        await client.query("ROLLBACK")
        return "discrepancy" as const
      }
      await deleteAndConfirm()
      await client.query(
        `
          UPDATE core.file_objects
          SET lifecycle_state = 'deleted', deletion_error = NULL,
            updated_at = now()
          WHERE id = $1 AND lifecycle_state = 'deletion_failed'
        `,
        [object.physicalObjectId]
      )
      await client.query("COMMIT")
      return "deleted" as const
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      await pool
        .query(
          `
            UPDATE core.file_objects
            SET deletion_error = $2, updated_at = now()
            WHERE id = $1 AND lifecycle_state = 'deletion_failed'
          `,
          [
            object.physicalObjectId,
            "Artifact source deletion remains unresolved.",
          ]
        )
        .catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  return {
    cleanupPairIsCurrent,
    close: () => pool.end(),
    commitLocatorMigration,
    inventory,
    listDeletionFailedOrphans,
    listLiveObjects,
    listPendingSourceCleanups,
    markSourceCleanupComplete,
    recordSourceCleanupFailure,
    recoverDeletionFailedObject,
    schemaStatus,
  }
}

export type ArtifactStorageMigrationRepository = ReturnType<
  typeof createArtifactStorageMigrationRepository
>

function exactBytes(
  bytes: Buffer,
  expected: { byteSize: number; sha256: string }
) {
  return (
    bytes.byteLength === expected.byteSize &&
    createHash("sha256").update(bytes).digest("hex") === expected.sha256
  )
}

function failureCode(error: unknown, operation: string) {
  if (error instanceof ArtifactStorageError) {
    return `${operation}-${error.code}`
  }
  return `${operation}-failed`
}

async function fetchLegacySource(
  publicUrl: string | null,
  providerKey: string,
  fetchImplementation: typeof fetch
) {
  if (!validSourcePublicUrl(publicUrl, providerKey)) {
    throw new Error("Artifact source public URL is invalid.")
  }
  try {
    const response = await fetchImplementation(publicUrl, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel().catch(() => undefined)
      throw new ArtifactStorageError(
        "not-found",
        "The Artifact source was not found."
      )
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new ArtifactStorageError(
        "provider-failure",
        "The Artifact source returned a failed response."
      )
    }
    return Buffer.from(await response.arrayBuffer())
  } catch (error) {
    if (error instanceof ArtifactStorageError) throw error
    throw new ArtifactStorageError(
      "provider-failure",
      "The Artifact source could not be read.",
      { cause: error }
    )
  }
}

async function legacySourceUnavailable(
  publicUrl: string | null,
  providerKey: string,
  fetchImplementation: typeof fetch
) {
  if (!validSourcePublicUrl(publicUrl, providerKey)) {
    throw new Error("Artifact source public URL is invalid.")
  }
  let response: Response
  try {
    response = await fetchImplementation(publicUrl, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    throw new ArtifactStorageError(
      "provider-failure",
      "Artifact source availability could not be confirmed.",
      { cause: error }
    )
  }
  await response.body?.cancel().catch(() => undefined)
  if (response.status === 404 || response.status === 410) return true
  if (response.ok) return false
  throw new ArtifactStorageError(
    "provider-failure",
    "Artifact source availability response was ambiguous."
  )
}

async function deleteAndConfirmProviderUnavailable(
  provider: ArtifactStorageProvider,
  key: string
) {
  let deletionError: unknown
  try {
    await provider.delete({ key })
  } catch (error) {
    deletionError = error
  }
  try {
    await provider.read({ key })
  } catch (error) {
    if (error instanceof ArtifactStorageError && error.code === "not-found") {
      return
    }
    throw deletionError ?? error
  }
  throw deletionError ?? new Error("Artifact source remains readable.")
}

export function createArtifactStorageMigrationService(input: {
  destinationProvider: ArtifactStorageProvider
  fetchImplementation?: typeof fetch
  repository: ArtifactStorageMigrationRepository
}) {
  if (input.destinationProvider.identifier !== destinationProvider) {
    throw new Error(
      "Artifact migration destination must be Google Cloud Storage."
    )
  }
  const fetchImplementation = input.fetchImplementation ?? fetch

  async function recordCleanupFailure(
    cleanup: ArtifactSourceCleanup,
    message: string
  ) {
    await input.repository
      .recordSourceCleanupFailure(cleanup, message)
      .catch(() => undefined)
  }

  async function reconcileCleanup(cleanup: ArtifactSourceCleanup) {
    if (
      cleanup.sourceProvider !== sourceProvider ||
      !validSourcePublicUrl(cleanup.sourcePublicUrl, cleanup.sourceProviderKey)
    ) {
      await recordCleanupFailure(cleanup, "invalid-source-metadata")
      return "invalid-source-metadata"
    }
    let pairIsCurrent: boolean
    try {
      pairIsCurrent = await input.repository.cleanupPairIsCurrent(cleanup)
    } catch {
      await recordCleanupFailure(cleanup, "cleanup-pair-check-failed")
      return "cleanup-pair-check-failed"
    }
    if (!pairIsCurrent) {
      await recordCleanupFailure(
        cleanup,
        "Artifact locator no longer matches its cleanup record."
      )
      return "cleanup-pair-discrepancy"
    }
    let destinationBytes: Buffer
    try {
      destinationBytes = await input.destinationProvider.read({
        key: cleanup.destinationProviderKey,
      })
    } catch (error) {
      const code = failureCode(error, "destination-read")
      await recordCleanupFailure(cleanup, code)
      return code
    }
    if (
      !exactBytes(destinationBytes, {
        byteSize: cleanup.expectedByteSize,
        sha256: cleanup.expectedSha256,
      })
    ) {
      await recordCleanupFailure(cleanup, "destination-integrity-failure")
      return "destination-integrity-failure"
    }
    try {
      const unavailable = await legacySourceUnavailable(
        cleanup.sourcePublicUrl,
        cleanup.sourceProviderKey,
        fetchImplementation
      )
      if (!unavailable) {
        await recordCleanupFailure(cleanup, "source-still-public")
        return "source-still-public"
      }
    } catch (error) {
      const code = failureCode(error, "source-cleanup")
      await recordCleanupFailure(cleanup, code)
      return code
    }
    let completed: boolean
    try {
      completed = await input.repository.markSourceCleanupComplete(cleanup)
    } catch {
      await recordCleanupFailure(cleanup, "cleanup-commit-failed")
      return "cleanup-commit-failed"
    }
    if (!completed) {
      await recordCleanupFailure(cleanup, "cleanup-commit-discrepancy")
      return "cleanup-commit-discrepancy"
    }
    return null
  }

  async function migrateBatch(options: { limit: number }) {
    const schema = await input.repository.schemaStatus()
    if (!schema.cleanupSchemaAvailable) {
      throw new Error("Artifact source cleanup schema is unavailable.")
    }
    const candidates = await input.repository.listLiveObjects({
      limit: options.limit,
      provider: sourceProvider,
    })
    const failures: Array<{ code: string; physicalObjectId: string }> = []
    let migrated = 0
    let reconciledCleanups = 0

    for (const object of candidates.items) {
      if (
        object.lifecycleState !== "available" ||
        object.liveReferenceCount < 1 ||
        !object.providerKey.trim() ||
        !validSourcePublicUrl(object.publicUrl, object.providerKey) ||
        !/^[a-f0-9]{64}$/.test(object.sha256)
      ) {
        failures.push({
          code: "invalid-source-metadata",
          physicalObjectId: object.physicalObjectId,
        })
        continue
      }
      let bytes: Buffer
      try {
        bytes = await fetchLegacySource(
          object.publicUrl,
          object.providerKey,
          fetchImplementation
        )
      } catch (error) {
        failures.push({
          code: failureCode(error, "source-read"),
          physicalObjectId: object.physicalObjectId,
        })
        continue
      }
      if (!exactBytes(bytes, object)) {
        failures.push({
          code: "source-integrity-failure",
          physicalObjectId: object.physicalObjectId,
        })
        continue
      }
      let destinationKey: string
      try {
        const uploaded = await input.destinationProvider.upload({
          bytes,
          customId: `${object.organizationId}:${object.sha256}:${object.byteSize}`,
          mediaType: "application/octet-stream",
          name: `artifact-${object.physicalObjectId}`,
        })
        destinationKey = uploaded.key
      } catch (error) {
        failures.push({
          code: failureCode(error, "destination-write"),
          physicalObjectId: object.physicalObjectId,
        })
        continue
      }
      let committed:
        | Awaited<
            ReturnType<
              ArtifactStorageMigrationRepository["commitLocatorMigration"]
            >
          >
        | undefined
      try {
        committed = await input.repository.commitLocatorMigration(
          object,
          destinationKey
        )
      } catch {
        failures.push({
          code: "locator-commit-failed",
          physicalObjectId: object.physicalObjectId,
        })
        continue
      }
      if (committed.status === "discrepancy") {
        failures.push({
          code: "locator-commit-discrepancy",
          physicalObjectId: object.physicalObjectId,
        })
        continue
      }
      if (committed.status === "migrated") migrated += 1
      const cleanupFailure = await reconcileCleanup(committed.cleanup)
      if (cleanupFailure) {
        failures.push({
          code: cleanupFailure,
          physicalObjectId: object.physicalObjectId,
        })
      } else {
        reconciledCleanups += 1
      }
    }

    return {
      failures,
      migrated,
      processed: candidates.items.length,
      reconciledCleanups,
      recoveredDeletions: 0,
      remaining: candidates.nextAfterId !== null,
    } satisfies ArtifactStorageMigrationResult
  }

  async function reconcile(options: { limit: number }) {
    const schema = await input.repository.schemaStatus()
    if (!schema.cleanupSchemaAvailable) {
      throw new Error("Artifact source cleanup schema is unavailable.")
    }
    const failures: Array<{ code: string; physicalObjectId: string }> = []
    const cleanups = await input.repository.listPendingSourceCleanups(options)
    let reconciledCleanups = 0
    for (const cleanup of cleanups) {
      const cleanupFailure = await reconcileCleanup(cleanup)
      if (cleanupFailure) {
        failures.push({
          code: cleanupFailure,
          physicalObjectId: cleanup.physicalObjectId,
        })
      } else {
        reconciledCleanups += 1
      }
    }

    const remainingLimit = Math.max(0, options.limit - cleanups.length)
    const orphans = remainingLimit
      ? await input.repository.listDeletionFailedOrphans({
          limit: remainingLimit,
        })
      : []
    let recoveredDeletions = 0
    for (const object of orphans) {
      try {
        const result = await input.repository.recoverDeletionFailedObject(
          object,
          async () => {
            if (object.provider === sourceProvider) {
              if (
                !(await legacySourceUnavailable(
                  object.publicUrl,
                  object.providerKey,
                  fetchImplementation
                ))
              ) {
                throw new Error("Artifact source remains publicly available.")
              }
              return
            }
            await deleteAndConfirmProviderUnavailable(
              input.destinationProvider,
              object.providerKey
            )
          }
        )
        if (result === "deleted") recoveredDeletions += 1
        else {
          failures.push({
            code: "deletion-recovery-discrepancy",
            physicalObjectId: object.physicalObjectId,
          })
        }
      } catch (error) {
        failures.push({
          code: failureCode(error, "deletion-recovery"),
          physicalObjectId: object.physicalObjectId,
        })
      }
    }
    return {
      failures,
      migrated: 0,
      processed: cleanups.length + orphans.length,
      reconciledCleanups,
      recoveredDeletions,
      remaining: cleanups.length + orphans.length >= options.limit,
    } satisfies ArtifactStorageMigrationResult
  }

  async function verifyReadiness(): Promise<ArtifactStorageReadiness> {
    const failures: Array<{ code: string; physicalObjectId: string }> = []
    let checked = 0
    let afterId: string | undefined
    do {
      const page = await input.repository.listLiveObjects({
        afterId,
        limit: 100,
        provider: destinationProvider,
      })
      for (const object of page.items) {
        try {
          const bytes = await input.destinationProvider.read({
            key: object.providerKey,
          })
          checked += 1
          if (!exactBytes(bytes, object)) {
            failures.push({
              code: "destination-integrity-failure",
              physicalObjectId: object.physicalObjectId,
            })
          }
        } catch (error) {
          failures.push({
            code: failureCode(error, "destination-read"),
            physicalObjectId: object.physicalObjectId,
          })
        }
      }
      afterId = page.nextAfterId ?? undefined
    } while (afterId)

    const inventory = await input.repository.inventory()
    return {
      complete:
        inventory.cleanupSchemaAvailable &&
        inventory.live.uploadThingObjects === 0 &&
        inventory.cleanup.pending === 0 &&
        inventory.metadataBlockers.length === 0 &&
        failures.length === 0 &&
        checked === inventory.live.googleCloudStorageObjects,
      integrity: { checked, failures },
      inventory,
    }
  }

  return { migrateBatch, reconcile, verifyReadiness }
}
