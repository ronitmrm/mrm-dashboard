import { describe, expect, test, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  createGoogleCloudArtifactProvider,
  googleCloudArtifactObjectKey,
  readGoogleCloudArtifactEnvironment,
} from "./google-cloud-artifact-provider"

const localEnvironment = {
  GCS_BUCKET_NAME: "mrm-artifacts-test",
  GCS_PROJECT_ID: "mrm-artifacts-test",
}

function googleFile(bytes = Buffer.from("drawing")) {
  return {
    createResumableUpload: vi.fn().mockResolvedValue(["https://session.test"]),
    delete: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue([bytes]),
    getMetadata: vi.fn().mockResolvedValue([{ generation: "42" }]),
    save: vi.fn().mockResolvedValue(undefined),
  }
}

function storageWith(file: ReturnType<typeof googleFile>) {
  const fileFactory = vi.fn(() => file)
  return {
    fileFactory,
    storageClient: {
      bucket: vi.fn(() => ({ file: fileFactory })),
    },
  }
}

describe("Google Cloud Artifact provider", () => {
  test("requires an operator client locally and validates Vercel workload identity", () => {
    expect(readGoogleCloudArtifactEnvironment(localEnvironment)).toMatchObject({
      bucketName: "mrm-artifacts-test",
      projectId: "mrm-artifacts-test",
      workloadIdentity: { kind: "operator-client-required" },
    })
    expect(() => createGoogleCloudArtifactProvider(localEnvironment)).toThrow(
      "requires an explicit authenticated storage client"
    )
    expect(() =>
      readGoogleCloudArtifactEnvironment({
        GCS_BUCKET_NAME: "Invalid Bucket",
        GCS_PROJECT_ID: "mrm-artifacts-test",
      })
    ).toThrow("GCS_BUCKET_NAME must be a valid Google Cloud bucket name")
    expect(() =>
      readGoogleCloudArtifactEnvironment({ ...localEnvironment, VERCEL: "1" })
    ).toThrow("GCS_PROJECT_NUMBER is required")
    expect(
      readGoogleCloudArtifactEnvironment({
        ...localEnvironment,
        GCS_PROJECT_NUMBER: "123456789",
        GCS_SERVICE_ACCOUNT_EMAIL:
          "artifact-runtime@mrm-artifacts-test.iam.gserviceaccount.com",
        GCS_WORKLOAD_IDENTITY_POOL_ID: "mrm-artifact-pool",
        GCS_WORKLOAD_IDENTITY_PROVIDER_ID: "vercel-production",
        VERCEL: "1",
      })
    ).toMatchObject({
      workloadIdentity: {
        audience:
          "//iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/mrm-artifact-pool/providers/vercel-production",
        kind: "vercel-oidc",
        vercelAudience:
          "https://iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/mrm-artifact-pool/providers/vercel-production",
      },
    })
  })

  test("stores and verifies exact bytes under an opaque immutable key", async () => {
    const bytes = Buffer.from("drawing")
    const target = googleFile(bytes)
    const { storageClient } = storageWith(target)
    const provider = createGoogleCloudArtifactProvider(localEnvironment, {
      storageClient,
    })

    const uploaded = await provider.upload({
      bytes,
      customId: "organization-id:sha256:7",
      mediaType: "application/pdf",
      name: "customer-name.pdf",
    })

    expect(uploaded).toEqual({
      key: googleCloudArtifactObjectKey("organization-id:sha256:7"),
    })
    expect(uploaded.key).not.toContain("organization-id")
    expect(uploaded.key).not.toContain("customer-name")
    expect(target.save).toHaveBeenCalledWith(bytes, {
      gzip: false,
      metadata: { contentType: "application/pdf" },
      preconditionOpts: { ifGenerationMatch: 0 },
      resumable: false,
      validation: "crc32c",
    })
    expect(target.download).toHaveBeenCalledWith({
      decompress: false,
      validation: "crc32c",
    })
  })

  test("reuses matching immutable bytes and rejects a deterministic-key mismatch", async () => {
    const target = googleFile(Buffer.from("drawing"))
    target.save.mockRejectedValue({ code: 412 })
    const { storageClient } = storageWith(target)
    const provider = createGoogleCloudArtifactProvider(localEnvironment, {
      storageClient,
    })
    const upload = {
      bytes: Buffer.from("drawing"),
      customId: "organization-id:sha256:7",
      mediaType: "application/pdf",
      name: "drawing.pdf",
    }

    await expect(provider.upload(upload)).resolves.toEqual({
      key: googleCloudArtifactObjectKey(upload.customId),
    })
    target.download.mockResolvedValueOnce([Buffer.from("different")])
    await expect(provider.upload(upload)).rejects.toThrow(
      "Google Cloud Storage found different bytes at the retained file key."
    )
  })

  test("reads exact bytes and deletes only the observed generation", async () => {
    const bytes = Buffer.from([0, 255, 1, 2])
    const target = googleFile(bytes)
    const { fileFactory, storageClient } = storageWith(target)
    const provider = createGoogleCloudArtifactProvider(localEnvironment, {
      storageClient,
    })

    await expect(provider.read({ key: "artifacts/key" })).resolves.toEqual(
      bytes
    )
    await expect(
      provider.delete({ key: "artifacts/key" })
    ).resolves.toBeUndefined()
    expect(fileFactory).toHaveBeenLastCalledWith("artifacts/key", {
      generation: "42",
    })
    expect(target.delete).toHaveBeenCalledWith({ ignoreNotFound: true })
  })

  test("treats an absent delete as success and translates SDK failures", async () => {
    const target = googleFile()
    target.getMetadata.mockRejectedValueOnce({ code: 404 })
    const { storageClient } = storageWith(target)
    const provider = createGoogleCloudArtifactProvider(localEnvironment, {
      storageClient,
    })

    await expect(
      provider.delete({ key: "artifacts/missing" })
    ).resolves.toBeUndefined()
    expect(target.delete).not.toHaveBeenCalled()

    target.download.mockRejectedValueOnce({ code: 404 })
    await expect(
      provider.read({ key: "artifacts/missing" })
    ).rejects.toMatchObject({ code: "not-found" })

    target.download.mockRejectedValueOnce(new Error("bucket/key unavailable"))
    await expect(
      provider.read({ key: "artifacts/private-key" })
    ).rejects.toMatchObject({
      code: "provider-failure",
      message: "Google Cloud Storage could not read the retained file.",
    })
  })

  test("inspects resumable 308 manually and treats cancelled 499 as terminal", async () => {
    const { storageClient } = storageWith(googleFile())
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { Range: "bytes=0-262143" },
          status: 308,
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 499 }))
    const provider = createGoogleCloudArtifactProvider(localEnvironment, {
      fetchImplementation,
      storageClient,
    })

    await expect(
      provider.getResumableStatus({
        expectedByteSize: 1024 * 1024,
        session: "https://session.test" as never,
      })
    ).resolves.toEqual({ complete: false, nextOffset: 262144 })
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "https://session.test",
      expect.objectContaining({ method: "PUT", redirect: "manual" })
    )
    await expect(
      provider.getResumableStatus({
        expectedByteSize: 1024 * 1024,
        session: "https://session.test" as never,
      })
    ).rejects.toMatchObject({ code: "not-found" })
  })

  test("streams 25 MiB through one session in sequential chunks up to 4 MiB", async () => {
    const { storageClient } = storageWith(googleFile())
    const total = 25 * 1024 * 1024
    const chunkSize = 4 * 1024 * 1024
    const fetchImplementation = vi.fn(async (_session, init) => {
      const range = new Headers(init?.headers).get("Content-Range")!
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range)
      if (!match) return new Response(null, { status: 308 })
      const end = Number(match[2])
      return end + 1 === total
        ? new Response(null, { status: 200 })
        : new Response(null, {
            headers: { Range: `bytes=0-${end}` },
            status: 308,
          })
    })
    const provider = createGoogleCloudArtifactProvider(localEnvironment, {
      fetchImplementation,
      storageClient,
    })
    const session = "https://session.test" as never
    let offset = 0
    while (offset < total) {
      const bytes = Buffer.alloc(Math.min(chunkSize, total - offset), 7)
      const progress = await provider.uploadResumableChunk({
        bytes,
        expectedByteSize: total,
        offset,
        session,
      })
      expect(progress.nextOffset).toBe(offset + bytes.byteLength)
      offset = progress.nextOffset
    }

    expect(fetchImplementation).toHaveBeenCalledTimes(7)
    for (const [, init] of fetchImplementation.mock.calls) {
      expect((init?.body as Uint8Array).byteLength).toBeLessThanOrEqual(
        chunkSize
      )
      expect(init).toMatchObject({ method: "PUT", redirect: "manual" })
    }
  })
})
