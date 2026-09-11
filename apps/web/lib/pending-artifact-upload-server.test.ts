import { randomUUID } from "node:crypto"

import {
  ArtifactStorageError,
  type ArtifactResumableUploadProvider,
  type PendingArtifactUploadRecord,
} from "@workspace/db"
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("./auth/auth", () => ({ getAuth: vi.fn() }))
vi.mock("./google-cloud-artifact-provider", () => ({
  createGoogleCloudArtifactProvider: vi.fn(),
}))
vi.mock("./postgres-runtime", () => ({
  getWebPostgresPool: vi.fn(() => ({
    connect: vi.fn(async () => ({ query: vi.fn(), release: vi.fn() })),
  })),
}))
vi.mock("./pending-artifact-upload-policy", () => ({
  authorizePendingUploadIntent: vi.fn((_client, _intent, authorization) =>
    Promise.resolve(authorization.organizationId ?? "organization-id")
  ),
  normalizePendingUploadMetadata: vi.fn(),
  validatePendingUploadBytes: vi.fn(),
}))

import {
  appendPendingArtifactUploadChunk,
  assertSameOriginMutation,
  cleanupPendingArtifactUploads,
  completePendingArtifactUpload,
  getPendingArtifactUpload,
  readBoundedUploadChunk,
} from "./pending-artifact-upload-server"
import { pendingUploadIntentEquals } from "./artifact-upload-contract"

function upload(
  overrides: Partial<PendingArtifactUploadRecord> = {}
): PendingArtifactUploadRecord {
  const now = new Date("2026-09-11T12:00:00Z")
  return {
    cleanupCompletedAt: null,
    cleanupError: null,
    completedByteSize: null,
    completedSha256: null,
    confirmedOffset: 0,
    createdAt: now,
    expectedByteSize: 5,
    expiresAt: new Date("2026-09-12T12:00:00Z"),
    finalArtifactId: null,
    finalPurpose: null,
    finalTargetId: null,
    finalTargetSchema: null,
    finalTargetTable: null,
    id: randomUUID(),
    intent: { index: 1, kind: "maintenance-request-photo" },
    mediaType: "image/png",
    organizationId: "organization-id",
    originalFileName: "photo.png",
    ownerUserId: "user-id",
    provider: "google-cloud-storage",
    providerKey: `pending-artifact-uploads/${randomUUID()}`,
    resumableSession: "https://session.test" as never,
    status: "uploading",
    temporaryGeneration: null,
    updatedAt: now,
    ...overrides,
  }
}

function repository(record: PendingArtifactUploadRecord) {
  return {
    close: vi.fn(),
    create: vi.fn(),
    get: vi.fn().mockResolvedValue(record),
    listCleanupCandidateIds: vi.fn().mockResolvedValue([record.id]),
    withLockedUpload: vi.fn(async (_id, operation) =>
      operation(
        record,
        async (changes: Partial<PendingArtifactUploadRecord>) => {
          Object.assign(record, changes)
          return record
        },
        {}
      )
    ),
  }
}

function provider() {
  return {
    cancelResumable: vi.fn().mockResolvedValue(undefined),
    deleteTemporary: vi.fn().mockResolvedValue(undefined),
    getResumableStatus: vi
      .fn()
      .mockResolvedValue({ complete: false, nextOffset: 0 }),
    readTemporary: vi.fn().mockResolvedValue({
      bytes: Buffer.from("12345"),
      generation: "42",
    }),
    startResumable: vi.fn(),
    uploadResumableChunk: vi.fn(),
  } satisfies ArtifactResumableUploadProvider
}

const authorization = {
  grantedCapabilities: new Set<string>(),
  organizationId: "organization-id",
  userId: "user-id",
}

beforeEach(() => vi.clearAllMocks())

describe("pending Artifact upload lifecycle", () => {
  test("matches a JSONB intent after persisted key reordering", () => {
    expect(
      pendingUploadIntentEquals(
        { kind: "maintenance-request-photo", index: 1 },
        { index: 1, kind: "maintenance-request-photo" }
      )
    ).toBe(true)
  })

  test("rejects expired reads before provider access", async () => {
    const record = upload({ expiresAt: new Date("2026-09-10T12:00:00Z") })
    const storage = provider()

    await expect(
      getPendingArtifactUpload(record.id, authorization, {
        now: () => new Date("2026-09-11T12:00:00Z"),
        provider: storage,
        repository: repository(record) as never,
      })
    ).rejects.toMatchObject({ code: "expired" })
    expect(storage.getResumableStatus).not.toHaveBeenCalled()
  })

  test("hides another owner's upload and rejects cross-origin or oversized bytes", async () => {
    const record = upload()
    const storage = provider()
    await expect(
      getPendingArtifactUpload(
        record.id,
        { ...authorization, userId: "another-user" },
        {
          provider: storage,
          repository: repository(record) as never,
        }
      )
    ).rejects.toMatchObject({ code: "not_found" })
    expect(() =>
      assertSameOriginMutation(
        new Request("https://dashboard.example.test/api/artifact-uploads", {
          headers: { Origin: "https://attacker.example.test" },
          method: "POST",
        })
      )
    ).toThrowError(expect.objectContaining({ code: "forbidden" }))
    await expect(
      readBoundedUploadChunk(
        new Request("https://dashboard.example.test/api/artifact-uploads/id", {
          body: Buffer.alloc(4 * 1024 * 1024 + 1),
          duplex: "half",
          method: "PUT",
        } as RequestInit)
      )
    ).rejects.toMatchObject({ code: "invalid_request" })
  })

  test("rejects a stale offset without forwarding bytes", async () => {
    const record = upload({ confirmedOffset: 262_144 })
    const storage = provider()

    await expect(
      appendPendingArtifactUploadChunk(
        {
          authorization,
          bytes: Buffer.alloc(262_144),
          offset: 0,
          uploadId: record.id,
        },
        {
          now: () => new Date("2026-09-11T12:00:00Z"),
          provider: storage,
          repository: repository(record) as never,
        }
      )
    ).rejects.toMatchObject({ code: "state_conflict" })
    expect(storage.uploadResumableChunk).not.toHaveBeenCalled()
  })

  test("commits rejected state for completed bytes with the wrong size", async () => {
    const record = upload()
    const storage = provider()
    storage.getResumableStatus.mockRejectedValue(
      new ArtifactStorageError("not-found", "session unavailable")
    )
    storage.readTemporary.mockResolvedValue({
      bytes: Buffer.from("bad"),
      generation: "42",
    })

    await expect(
      completePendingArtifactUpload(record.id, authorization, {
        now: () => new Date("2026-09-11T12:00:00Z"),
        provider: storage,
        repository: repository(record) as never,
      })
    ).rejects.toMatchObject({ code: "integrity_failure" })
    expect(record.status).toBe("rejected")
  })

  test("never deletes outside the temporary namespace and retries finalized cleanup", async () => {
    const unsafe = upload({
      providerKey: "artifacts/retained",
      status: "rejected",
    })
    const unsafeStorage = provider()
    await expect(
      cleanupPendingArtifactUploads(
        { before: new Date("2026-09-13T00:00:00Z"), limit: 1 },
        { provider: unsafeStorage, repository: repository(unsafe) as never }
      )
    ).resolves.toMatchObject({ failed: 1 })
    expect(unsafeStorage.deleteTemporary).not.toHaveBeenCalled()

    const finalized = upload({
      status: "finalized",
      temporaryGeneration: "42",
    })
    const finalizedRepository = repository(finalized)
    const finalizedStorage = provider()
    finalizedStorage.deleteTemporary.mockRejectedValueOnce(new Error("retry"))
    await cleanupPendingArtifactUploads(
      { before: new Date("2026-09-13T00:00:00Z"), limit: 1 },
      {
        provider: finalizedStorage,
        repository: finalizedRepository as never,
      }
    )
    expect(finalized.cleanupCompletedAt).toBeNull()
    expect(finalized.cleanupError).toBe("Temporary upload cleanup failed.")

    await expect(
      cleanupPendingArtifactUploads(
        { before: new Date("2026-09-13T00:00:00Z"), limit: 1 },
        {
          provider: finalizedStorage,
          repository: finalizedRepository as never,
        }
      )
    ).resolves.toMatchObject({ cleaned: 1, failed: 0 })
    expect(finalized.cleanupCompletedAt).toEqual(
      new Date("2026-09-13T00:00:00Z")
    )
  })
})
