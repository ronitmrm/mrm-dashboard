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
  test("validates ADC and Vercel workload identity configuration", () => {
    expect(readGoogleCloudArtifactEnvironment(localEnvironment)).toMatchObject({
      bucketName: "mrm-artifacts-test",
      projectId: "mrm-artifacts-test",
      workloadIdentity: { kind: "application-default-credentials" },
    })
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
})
